import { Injectable, computed, inject, signal } from '@angular/core';
import { SessionService } from '../session/session.service';
import { BusinessClock } from '../time/business-clock';
import { STARTER_PACKS } from '../ideas/idea-warehouse.fixture';
import { ShelfCandidate, shelfCandidates } from './shelf';

export interface PublishedPack {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly signalIds: readonly string[];
  readonly publishedBy: string;
  readonly publishedAt: string;
}

export interface ShelfRequest {
  readonly id: string;
  readonly forDate: string;
  readonly ideaIds: readonly string[];
  readonly sentBy: string;
  readonly sentAt: string;
}

/**
 * Tomorrow's shelf picks, shelf requests already sent to the desk, and starter packs published to every launch user.
 * Held for the session; the gateway keeps them once wired.
 */
@Injectable({ providedIn: 'root' })
export class ShelfStore {
  private readonly session = inject(SessionService);
  private readonly clock = inject(BusinessClock);

  readonly candidates: readonly ShelfCandidate[] = shelfCandidates();
  readonly picked = signal<ReadonlySet<string>>(new Set(['w-01', 'w-09', 'w-15']));
  readonly requests = signal<readonly ShelfRequest[]>([]);
  readonly published = signal<readonly PublishedPack[]>([
    { id: 'pub-rollover', name: STARTER_PACKS.find((p) => p.id === 'rollover')!.name, blurb: 'Published for the month-end rollover push.', signalIds: STARTER_PACKS.find((p) => p.id === 'rollover')!.signalIds, publishedBy: 'Daniel Cheng', publishedAt: '2026-10-30T10:00:00+08:00' },
  ]);

  readonly pickedCandidates = computed(() => this.candidates.filter((c) => this.picked().has(c.id)));

  toggle(id: string): void {
    const c = this.candidates.find((x) => x.id === id);
    if (!c || c.limitState === 'red') {
      return;
    }
    this.picked.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Text for the desk's bulk pricing request. Internal: the desk prices, nothing goes to clients. */
  requestText(forDate: string): string {
    const lines = this.pickedCandidates().map((c, i) => `${i + 1}. ${c.title} · ${c.terms}`);
    return [`Shelf for ${forDate}: please price before opening.`, ...lines, `From ${this.session.user().displayName}, CBG Product Manager. Internal use only.`].join('\n');
  }

  markRequested(forDate: string): ShelfRequest | null {
    if (!this.picked().size) return null;
    const req: ShelfRequest = { id: `shelf-${this.requests().length + 1}`, forDate, ideaIds: [...this.picked()], sentBy: this.session.user().displayName, sentAt: new Date().toISOString() };
    this.requests.update((list) => [req, ...list]);
    return req;
  }

  isPublished(name: string): boolean {
    return this.published().some((p) => p.name === name);
  }

  publish(pack: { name: string; blurb: string; signalIds: readonly string[] }): void {
    if (this.isPublished(pack.name)) return;
    this.published.update((list) => [
      { id: `pub-${Date.now().toString(36)}-${list.length}`, name: pack.name, blurb: pack.blurb, signalIds: pack.signalIds, publishedBy: this.session.user().displayName, publishedAt: new Date().toISOString() },
      ...list,
    ]);
  }

  unpublish(name: string): void {
    this.published.update((list) => list.filter((p) => p.name !== name));
  }

  get today(): string {
    return this.clock.firstBusinessDay();
  }
}
