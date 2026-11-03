import { Injectable, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { APP_CONFIG } from '../../core/config/app-config';
import { TodayDataSource } from '../../core/data/today-data-source';
import { BookScope, Lead, MOMENT_TYPES, MomentType } from '../../core/models/today.models';
import { BusinessClock } from '../../core/time/business-clock';
import { SessionService } from '../../core/session/session.service';
import { momentText } from './shared/moment-text';

/** Context handed in by a linked Digimarkets widget (for example a row picked in the Blotter). */
export interface LinkedContext {
  readonly clientId: string;
  readonly clientShortName: string;
  readonly fromWidget: string;
}

/**
 * State for the Today tab, held in signals. Loading, error and empty states come from the
 * resources; the screens only read them. Provided by the Today layout, so it lives as long as the tab.
 */
@Injectable()
export class TodayStore {
  private readonly data = inject(TodayDataSource);
  private readonly config = inject(APP_CONFIG);
  private readonly clock = inject(BusinessClock);
  private readonly session = inject(SessionService);

  // What the RM has chosen
  readonly scope = signal<BookScope>('my-book');
  readonly activeTypes = signal<ReadonlySet<MomentType>>(new Set(MOMENT_TYPES));
  readonly focusedDay = signal<number | null>(null);
  readonly pickedClientId = signal<string | null>(null);
  readonly linkedContext = signal<LinkedContext | null>({ clientId: 'c-4821', clientShortName: 'Chan T.', fromWidget: 'Blotter' });
  readonly parkedLeadIds = signal<ReadonlySet<string>>(new Set());
  readonly showAllLeads = signal(false);
  readonly composerDraft = signal('');
  readonly callNotes = signal<ReadonlySet<string>>(new Set());
  /** Whether the client panel on the right is shown. The RM can close it for more room. */
  readonly dockOpen = signal(true);

  // Data
  readonly strip = rxResource({ params: () => this.scope(), stream: ({ params }) => this.data.getMomentStrip(params) });
  readonly brief = rxResource({ params: () => this.scope(), stream: ({ params }) => this.data.getMorningBrief(params) });

  /** The client the dock shows: the one picked here, else the linked widget's, else the top lead. */
  readonly dockClientId = computed<string | null>(
    () => this.pickedClientId() ?? this.linkedContext()?.clientId ?? this.allLeads()[0]?.clientId ?? null,
  );
  readonly client = rxResource({
    params: () => this.dockClientId(),
    stream: ({ params }) => (params ? this.data.getClientContext(params) : of(null)),
  });

  readonly allLeads = computed<readonly Lead[]>(() => (this.brief.hasValue() ? this.brief.value().leads : []));

  /** Leads after "Not today", the moment-type filter and the day focus. */
  readonly matchingLeads = computed(() => {
    const parked = this.parkedLeadIds();
    const types = this.activeTypes();
    const day = this.focusedDay();
    return this.allLeads().filter((l) => !parked.has(l.id) && types.has(l.moment.type) && (day === null || l.moment.offset === day));
  });

  readonly visibleLeads = computed(() =>
    this.showAllLeads() ? this.matchingLeads() : this.matchingLeads().slice(0, this.config.briefLeadLimit),
  );
  readonly hiddenLeads = computed(() => this.matchingLeads().slice(this.visibleLeads().length));

  readonly greeting = computed(() => {
    const hour = this.clock.hour();
    const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const count = this.allLeads().filter((l) => !this.parkedLeadIds().has(l.id)).length;
    const name = this.session.user().firstName;
    if (count === 0) {
      return `${part}, ${name}. Nobody needs you urgently today.`;
    }
    return `${part}, ${name}. ${count} ${count === 1 ? 'client needs' : 'clients need'} you today.`;
  });

  /** The brief lead for the client in the dock, if that client is in today's brief and not parked. */
  readonly focusedLead = computed<Lead | null>(() => {
    const id = this.dockClientId();
    const parked = this.parkedLeadIds();
    return this.allLeads().find((l) => l.clientId === id && !parked.has(l.id)) ?? null;
  });

  /** 1-based place of the focused lead among the leads still open today. */
  readonly focusedRank = computed(() => {
    const lead = this.focusedLead();
    return lead ? this.openLeads().indexOf(lead) + 1 : 0;
  });

  /** Leads not parked, in brief order (ignores the strip filters, so the dock can step through all of them). */
  readonly openLeads = computed(() => this.allLeads().filter((l) => !this.parkedLeadIds().has(l.id)));

  /** The short brief under the greeting: what kinds of moment are waiting, and who to start with. Built from data, no model. */
  readonly briefSummary = computed(() => {
    const open = this.openLeads();
    if (open.length === 0) {
      return '';
    }
    const words: Record<MomentType, [string, string]> = {
      maturity: ['maturity', 'maturities'],
      knockout: ['likely knock-out', 'likely knock-outs'],
      exercised: ['stock delivery', 'stock deliveries'],
      idle: ['idle client', 'idle clients'],
      rfq: ['open RFQ', 'open RFQs'],
    };
    const parts = MOMENT_TYPES.map((t) => [t, open.filter((l) => l.moment.type === t).length] as const)
      .filter(([, n]) => n > 0)
      .map(([t, n]) => `${n} ${words[t][n === 1 ? 0 : 1]}`);
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
    const first = open[0];
    const when = momentText(first.moment);
    const met = first.signals.filter((x) => x.met).length;
    return `${list[0].toUpperCase()}${list.slice(1)}. Start with ${first.clientName}: ${when.charAt(0).toLowerCase()}${when.slice(1)}, ${met} of ${first.signals.length} signals agree.`;
  });

  readonly filtersActive = computed(() => this.activeTypes().size < MOMENT_TYPES.length || this.focusedDay() !== null);

  setScope(scope: BookScope): void {
    this.scope.set(scope);
    this.focusedDay.set(null);
    this.showAllLeads.set(false);
  }

  toggleType(type: MomentType): void {
    this.activeTypes.update((current) => {
      const next = new Set(current);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  focusDay(offset: number): void {
    this.focusedDay.update((current) => (current === offset ? null : offset));
  }

  clearFilters(): void {
    this.activeTypes.set(new Set(MOMENT_TYPES));
    this.focusedDay.set(null);
  }

  pickClient(clientId: string): void {
    this.pickedClientId.set(clientId);
  }

  clearLinkedContext(): void {
    this.linkedContext.set(null);
  }

  /** "Not today": parks the lead for today and records it, so the outcome window knows it was seen. */
  parkLead(lead: Lead): void {
    this.parkedLeadIds.update((s) => new Set(s).add(lead.id));
    this.data.recordNotToday(lead.id).subscribe({ error: () => this.unparkLead(lead) });
  }

  /** Moves the dock to the lead after (or before) the focused one, wrapping round. */
  stepLead(direction: 1 | -1): void {
    const open = this.openLeads();
    if (open.length === 0) {
      return;
    }
    const current = this.focusedLead();
    const index = current ? open.indexOf(current) : -1;
    const next = open[(index + direction + open.length) % open.length];
    this.pickClient(next.clientId);
  }

  unparkLead(lead: Lead): void {
    this.parkedLeadIds.update((s) => {
      const next = new Set(s);
      next.delete(lead.id);
      return next;
    });
  }

  askAbout(clientName: string): void {
    this.composerDraft.set(`What should I know about ${clientName} before I call?`);
  }

  toggleCallNote(ideaId: string): void {
    this.callNotes.update((s) => {
      const next = new Set(s);
      if (next.has(ideaId)) {
        next.delete(ideaId);
      } else {
        next.add(ideaId);
      }
      return next;
    });
  }

  retry(): void {
    this.strip.reload();
    this.brief.reload();
  }
}
