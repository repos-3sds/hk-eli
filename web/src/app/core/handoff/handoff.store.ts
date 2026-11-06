import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';
import { SessionService, ROLE_LABELS } from '../session/session.service';
import { BusinessClock } from '../time/business-clock';
import { addBusinessDays } from '../time/business-calendar';
import { NO_HANDOFF_CONVERSION_PCT, PAST_HANDOFFS } from './handoff.fixture';
import { HANDOFF_STATUS_LABELS, HandoffItem, HandoffRecord, HandoffStatus, LINK_WINDOW_BUSINESS_DAYS, LinkedConversion } from './handoff.models';

export type NewHandoffItem = Omit<HandoffItem, 'id' | 'addedAt'>;

const INTERNAL = 'Internal use only. Not a recommendation; the owning RM checks suitability before any client conversation.';

/**
 * The hand-off list being built, and the record of lists already sent. The list travels by Teams or CSV (no
 * sending from HK ELI at launch); marking it sent starts the 10-business-day window in which a trade by the same
 * client in a related underlying is linked to it. Held for the session here; the gateway keeps the real record.
 */
@Injectable({ providedIn: 'root' })
export class HandoffStore {
  private readonly session = inject(SessionService);
  private readonly clock = inject(BusinessClock);
  private readonly config = inject(APP_CONFIG);
  private readonly http = inject(HttpClient);
  private counter = 0;

  /** Gateway mode: the gateway keeps the record (R38). Set when the last save failed, so the panel can say so. */
  readonly saveError = signal<string | null>(null);

  readonly draft = signal<readonly HandoffItem[]>([]);
  readonly records = signal<readonly HandoffRecord[]>(PAST_HANDOFFS);
  readonly tab = signal<'draft' | 'sent'>('draft');

  readonly count = computed(() => this.draft().length);

  /** The draft grouped by who gets it, owners in the order they were first added. */
  readonly byOwner = computed(() => {
    const groups = new Map<string, HandoffItem[]>();
    for (const item of this.draft()) {
      const key = `${item.ownerRm} · ${item.branch}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()].map(([owner, items]) => ({ owner, items }));
  });

  readonly conversion = computed<LinkedConversion>(() => {
    const outcomes = this.records().flatMap((r) => Object.values(r.outcomes));
    const linked = outcomes.filter((o) => o.status === 'linked-trade').length;
    const decided = outcomes.filter((o) => o.status === 'linked-trade' || o.status === 'window-closed').length;
    return {
      decided,
      linked,
      pct: decided ? Math.round((linked / decided) * 100) : null,
      noHandoffPct: NO_HANDOFF_CONVERSION_PCT,
      open: outcomes.filter((o) => o.status === 'sent').length,
      declined: outcomes.filter((o) => o.status === 'desk-declined').length,
    };
  });

  /** True when this client (and idea, if given) is already on the draft. */
  has(clientId: string | null, ideaTitle: string | null = null): boolean {
    return this.draft().some((i) => i.clientId === clientId && (i.idea?.title ?? null) === ideaTitle);
  }

  add(item: NewHandoffItem): HandoffItem | null {
    if (this.has(item.clientId, item.idea?.title ?? null)) {
      return null;
    }
    const full: HandoffItem = { ...item, id: `hd-${++this.counter}`, addedAt: new Date().toISOString() };
    this.draft.update((list) => [...list, full]);
    return full;
  }

  remove(id: string): void {
    this.draft.update((list) => list.filter((i) => i.id !== id));
  }

  clear(): void {
    this.draft.set([]);
  }

  /** Plain text for Teams: grouped by owner, every line with its reason, and the internal-only label. */
  teamsText(): string {
    const user = this.session.user();
    const lines = [`ELI hand-off from ${user.displayName} (${ROLE_LABELS[user.role]}), ${this.clock.today()}`, ''];
    for (const g of this.byOwner()) {
      lines.push(`For ${g.owner}:`);
      for (const i of g.items) {
        const idea = i.idea ? ` Idea: ${i.idea.title}, ${i.idea.terms} (indicative, priced ${i.idea.pricedAt.slice(11, 16)} HKT).` : '';
        lines.push(`- ${i.clientName ?? 'No client named'}: ${i.reason}.${idea}`);
      }
      lines.push('');
    }
    lines.push(INTERNAL);
    return lines.join('\n');
  }

  /** CSV with one row per item. Values are quoted; the last column carries the internal-only label. */
  csv(): string {
    const head = ['Owner RM', 'Branch', 'Client', 'Reason', 'Idea', 'Terms', 'Priced at', 'Added from', 'Label'];
    const rows = this.draft().map((i) => [i.ownerRm, i.branch, i.clientName ?? '', i.reason, i.idea?.title ?? '', i.idea?.terms ?? '', i.idea?.pricedAt ?? '', i.from, 'Internal use only']);
    return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  }

  /** Marks the draft as handed off: it becomes a record, and the linking window starts. */
  markSent(): HandoffRecord | null {
    const items = this.draft();
    if (!items.length) {
      return null;
    }
    const user = this.session.user();
    const today = this.clock.firstBusinessDay();
    const record: HandoffRecord = {
      id: `ho-${today.replaceAll('-', '').slice(4)}-${++this.counter}`,
      sentAt: new Date().toISOString(),
      sentBy: user.displayName,
      role: ROLE_LABELS[user.role],
      windowEnds: addBusinessDays(today, LINK_WINDOW_BUSINESS_DAYS, this.clock.holidays),
      items,
      outcomes: Object.fromEntries(items.map((i) => [i.id, { status: 'sent' as HandoffStatus, note: i.clientId ? null : 'No client named, so no trade can be linked' }])),
    };
    this.records.update((list) => [record, ...list]);
    this.draft.set([]);
    this.tab.set('sent');
    this.save(record);
    return record;
  }

  /** The desk said no to an item (for example over a limit). Recorded so it does not count as a missed trade. */
  recordDeskDecline(recordId: string, itemId: string, why: string): void {
    const note = why.trim() || 'No reason given';
    this.records.update((list) => list.map((r) => (r.id === recordId ? { ...r, outcomes: { ...r.outcomes, [itemId]: { status: 'desk-declined', note } } } : r)));
    if (this.config.dataSource === 'gateway' && !PAST_HANDOFFS.some((r) => r.id === recordId)) {
      this.http.patch(`${this.config.gatewayBaseUrl}/handoffs/${encodeURIComponent(recordId)}/items/${encodeURIComponent(itemId)}`, { status: 'desk-declined', note }).subscribe({
        next: () => this.saveError.set(null),
        error: () => this.saveError.set('The decline was not saved. Try again, or tell the product team.'),
      });
    }
  }

  /** Gateway mode: store the record; the gateway's id and window replace the local ones. */
  private save(local: HandoffRecord): void {
    if (this.config.dataSource !== 'gateway') {
      return;
    }
    this.http.post<HandoffRecord>(`${this.config.gatewayBaseUrl}/handoffs`, { items: local.items }).subscribe({
      next: (saved) => {
        this.saveError.set(null);
        const role = ROLE_LABELS[saved.role as keyof typeof ROLE_LABELS] ?? saved.role;
        this.records.update((list) => list.map((r) => (r.id === local.id ? { ...saved, role } : r)));
      },
      error: () => this.saveError.set('The list was marked sent here but not saved, so a later trade cannot be linked to it. Try again.'),
    });
  }

  statusLabel(status: HandoffStatus): string {
    return HANDOFF_STATUS_LABELS[status];
  }
}

function csvCell(v: string): string {
  return `"${v.replaceAll('"', '""')}"`;
}
