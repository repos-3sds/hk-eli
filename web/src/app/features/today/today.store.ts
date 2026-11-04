import { Injectable, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { APP_CONFIG } from '../../core/config/app-config';
import { TodayDataSource } from '../../core/data/today-data-source';
import { BookScope, Lead, MOMENT_TYPES, MomentType } from '../../core/models/today.models';
import { BusinessClock } from '../../core/time/business-clock';
import { SessionService } from '../../core/session/session.service';
import { momentText } from './shared/moment-text';

/**
 * State for the Today tab, held in signals. Loading, error and empty states come from the
 * resources; the screens only read them. Provided by the Today layout, so it lives as long as the tab.
 */
/**
 * Context a linked Digimarkets widget could hand in (for example a row picked in another widget).
 * The feature is in place but unused: HK ELI is designed to stand alone, so this stays null for now.
 */
export interface LinkedContext {
  readonly clientId: string;
  readonly clientShortName: string;
  readonly fromWidget: string;
}

@Injectable()
export class TodayStore {
  private readonly data = inject(TodayDataSource);
  private readonly config = inject(APP_CONFIG);
  private readonly clock = inject(BusinessClock);
  private readonly session = inject(SessionService);

  // What the user has chosen
  readonly scope = signal<BookScope>('my-book');
  readonly activeTypes = signal<ReadonlySet<MomentType>>(new Set(MOMENT_TYPES));
  readonly focusedDay = signal<number | null>(null);
  readonly pickedClientId = signal<string | null>(null);
  /** Not used yet: no widget is linked. */
  readonly linkedContext = signal<LinkedContext | null>(null);
  readonly parkedLeadIds = signal<ReadonlySet<string>>(new Set());
  readonly showAllLeads = signal(false);
  readonly composerDraft = signal('');
  readonly callNotes = signal<ReadonlySet<string>>(new Set());
  /** Whether the client panel on the right is shown. The RM can close it for more room. */
  readonly dockOpen = signal(false);
  /** Which list the landing view shows under the ask box. */
  readonly landingTab = signal<'brief' | 'calendar'>('brief');

  // Data
  readonly strip = rxResource({ params: () => this.scope(), stream: ({ params }) => this.data.getMomentStrip(params) });
  readonly brief = rxResource({ params: () => this.scope(), stream: ({ params }) => this.data.getMorningBrief(params) });

  /** The client the dock shows: the one the RM picked, else the top lead. HK ELI stands alone; no other widget hands in a client. */
  readonly dockClientId = computed<string | null>(
    () => this.pickedClientId() ?? this.linkedContext()?.clientId ?? this.allLeads()[0]?.clientId ?? null,
  );

  /** Short name of the client the RM picked, for the ask box chip. */
  readonly pickedShortName = computed(() => {
    const id = this.pickedClientId();
    if (!id) {
      return null;
    }
    if (this.client.hasValue() && this.client.value()?.id === id) {
      return this.client.value()!.shortName;
    }
    return this.allLeads().find((l) => l.clientId === id)?.clientShortName ?? null;
  });
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

  /** "Good evening, Srivalli": the small line above the headline. */
  readonly salutation = computed(() => {
    const hour = this.clock.hour();
    const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return `${part}, ${this.session.user().firstName}`;
  });

  /** The landing headline: how many clients need attention across the scope today. */
  readonly headline = computed(() => {
    const count = this.openLeads().length;
    if (count === 0) {
      return 'Nothing needs attention urgently today.';
    }
    return `${count} ${count === 1 ? 'client needs' : 'clients need'} attention today.`;
  });

  /** Ready-made questions under the ask box, by launch role. The first one for WMS names the top lead. */
  readonly suggestions = computed(() => {
    switch (this.session.role()) {
      case 'pm':
        return ['Top concentrations against limit', 'What was quoted and not traded this week?', 'Who matures this week?'];
      case 'tsm':
        return ['Where is rollover below 80% this month?', 'Who matures this week?', 'Which knock-outs are close to the barrier?'];
      default: {
        const top = this.openLeads()[0];
        const list = top ? [`Brief me on ${top.clientName.split(' ')[0]}`] : [];
        return [...list, 'Who matures this week?', 'Which knock-outs are close to the barrier?'];
      }
    }
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

  /** Puts a client in the right-hand panel and opens it. */
  pickClient(clientId: string): void {
    this.pickedClientId.set(clientId);
    this.dockOpen.set(true);
  }

  /** Back to the whole book: no client picked and no linked context. */
  clearPickedClient(): void {
    this.pickedClientId.set(null);
    this.linkedContext.set(null);
  }

  /** "Mark reviewed": takes the lead off today's list and records it, so the outcome window knows it was seen. */
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
    this.composerDraft.set(`What should I know about ${clientName}?`);
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
