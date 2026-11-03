import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Observable, delay, of, throwError, timer, switchMap } from 'rxjs';
import { APP_CONFIG, MockScenario } from '../config/app-config';
import {
  BookScope,
  ClientContext,
  EvidenceRow,
  Idea,
  Lead,
  Moment,
  MomentStrip,
  MorningBrief,
  QuoteRequestReceipt,
  RolloverIdeas,
  Signal,
} from '../models/today.models';
import { addBusinessDays, addDays, longDate, nextBusinessDays, weekdayName } from '../time/business-calendar';
import { BusinessClock } from '../time/business-clock';
import { TodayDataSource } from './today-data-source';
import {
  FIXTURE_CLIENTS,
  FIXTURE_IDEAS,
  FIXTURE_LEADS,
  FIXTURE_MOMENTS,
  FixtureClient,
  FixtureIdea,
  SIGNAL_CATALOGUE,
  SignalId,
  TEAM_ONLY_CLIENT_IDS,
} from './today.fixture';

const SIGNAL_ORDER: readonly SignalId[] = ['moment', 'cash', 'history', 'headroom', 'engaged', 'ideas'];
const RM_NAME = 'Srivalli T.';

/** Fixture-backed data source with simulated latency and switchable scenarios (?scenario=empty|error|slow). */
@Injectable()
export class MockTodayDataSource extends TodayDataSource {
  private readonly config = inject(APP_CONFIG);
  private readonly clock = inject(BusinessClock);
  private readonly document = inject(DOCUMENT);
  private quoteCounter = 0;

  private get scenario(): MockScenario {
    const fromUrl = new URLSearchParams(this.document.location?.search ?? '').get('scenario');
    return (fromUrl as MockScenario | null) ?? this.config.mockScenario;
  }

  private respond<T>(value: () => T): Observable<T> {
    const scenario = this.scenario;
    const latency = scenario === 'slow' ? this.config.mockLatencyMs * 6 : this.config.mockLatencyMs;
    if (scenario === 'error') {
      return timer(latency).pipe(switchMap(() => throwError(() => new Error('The Today service did not answer in time.'))));
    }
    return of(null).pipe(delay(latency), switchMap(() => of(value())));
  }

  private inScope(clientId: string, scope: BookScope): boolean {
    return scope === 'team' || !TEAM_ONLY_CLIENT_IDS.includes(clientId);
  }

  private client(clientId: string): FixtureClient {
    const client = FIXTURE_CLIENTS.find((c) => c.id === clientId);
    if (!client) {
      throw new Error(`Unknown client ${clientId}`);
    }
    return client;
  }

  private moments(scope: BookScope): Moment[] {
    if (this.scenario === 'empty') {
      return [];
    }
    const start = this.clock.firstBusinessDay();
    return FIXTURE_MOMENTS.filter((m) => this.inScope(m.clientId, scope)).map((m) => ({
      id: `m-${m.clientId}-${m.type}`,
      clientId: m.clientId,
      clientShortName: this.client(m.clientId).shortName,
      type: m.type,
      offset: m.offset,
      date: addBusinessDays(start, m.offset, this.clock.holidays),
    }));
  }

  private signal(id: SignalId, met: boolean, caveat?: string): Signal {
    return { id, met, ...SIGNAL_CATALOGUE[id], ...(caveat ? { caveat } : {}) };
  }

  getMomentStrip(scope: BookScope): Observable<MomentStrip> {
    return this.respond(() => {
      const days = nextBusinessDays(this.clock.firstBusinessDay(), this.config.businessDaysAhead, this.clock.holidays).map((date, offset) => ({ date, offset }));
      return { days, moments: this.moments(scope).filter((m) => m.offset < days.length) };
    });
  }

  getMorningBrief(scope: BookScope): Observable<MorningBrief> {
    return this.respond(() => {
      const moments = this.moments(scope);
      const leads: Lead[] = FIXTURE_LEADS.filter((l) => this.inScope(l.clientId, scope)).flatMap((fixture) => {
        const moment = moments.find((m) => m.clientId === fixture.clientId && m.type === fixture.momentType);
        if (!moment) {
          return [];
        }
        const client = this.client(fixture.clientId);
        const byId = new Map(fixture.signals.map((s) => [s.id, s]));
        return [{
          id: `lead-${fixture.clientId}-${fixture.momentType}`,
          clientId: client.id,
          clientName: client.name,
          clientShortName: client.shortName,
          segment: client.segment,
          cifMasked: client.cifMasked,
          moment,
          summary: fixture.summary.replace('{weekday}', weekdayName(moment.date)),
          signals: SIGNAL_ORDER.map((id) => this.signal(id, byId.get(id)?.met ?? false, byId.get(id)?.caveat)),
          action: fixture.action,
        }];
      });
      // Sorted by how many signals agree, then by how soon the moment is.
      leads.sort((a, b) => countMet(b.signals) - countMet(a.signals) || a.moment.offset - b.moment.offset);
      return {
        preparedAt: `${this.clock.today()}T07:10:00+08:00`,
        businessDate: this.clock.businessDate(),
        preparedFrom: "yesterday's blotter, fixings and RFQ log",
        sources: ['EQD master', 'outstanding stock'],
        leads,
      };
    });
  }

  getClientContext(clientId: string): Observable<ClientContext> {
    return this.respond(() => {
      const c = this.client(clientId);
      const today = this.clock.today();
      return {
        id: c.id,
        name: c.name,
        shortName: c.shortName,
        segment: c.segment,
        cifMasked: c.cifMasked,
        rmName: RM_NAME,
        linkedWidgets: [],
        riskProfile: c.riskProfile,
        eliOutstandingUsd: c.eliOutstandingUsd,
        maturingUsd: c.maturingUsd,
        lastTradeDate: c.lastTradeDaysAgo === null ? null : addDays(today, -c.lastTradeDaysAgo),
        concentration: c.concentration.map((x) => ({ ...x, limitPct: 25 })),
        outcomes: c.outcomes.map((o) => ({ date: addDays(today, -o.daysAgo), label: o.label, status: o.status })),
        recentRfqs: c.rfqs.map((r) => ({ date: addDays(today, -r.daysAgo), description: r.description, status: r.status })),
      };
    });
  }

  getIdeas(clientId: string): Observable<RolloverIdeas> {
    return this.respond(() => {
      const client = this.client(clientId);
      const moment = this.moments('team').find((m) => m.clientId === clientId);
      if (!moment) {
        throw new Error(`No moment for ${clientId}`);
      }
      const set = FIXTURE_IDEAS.find((s) => s.clientId === clientId) ?? genericIdeaSet(client);
      const pricedAt = `${this.clock.businessDate()}T18:00:00+08:00`;
      const toIdea = (f: FixtureIdea, rank: number): Idea => ({
        id: f.id,
        rank,
        title: f.title,
        tenor: f.tenor,
        terms: { kiPct: f.kiPct, strikePct: f.strikePct, couponPct: f.couponPct },
        pricedAt,
        signals: SIGNAL_ORDER.map((id) => this.signal(id, f.signalsMet.includes(id))),
        concentration: f.concentration,
        reason: f.reason,
      });
      return {
        clientId,
        clientName: client.name,
        clientShortName: client.shortName,
        moment,
        amountUsd: client.maturingUsd,
        ideas: set.ideas.map((f, i) => toIdea(f, i + 1)),
        rankedLower: set.rankedLower.map((f, i) => toIdea(f, set.ideas.length + i + 1)),
        callPrep: set.callPrep.map((line) => line.replace('{weekday}', weekdayName(moment.date))),
        outcome: 'open',
        outcomeWindowBusinessDays: this.config.maturingWindowBusinessDays,
      };
    });
  }

  getEvidenceRows(reference: string): Observable<readonly EvidenceRow[]> {
    return this.respond(() => {
      const asOf = longDate(this.clock.businessDate());
      const rows: EvidenceRow[] = [
        { source: 'EQD master', field: 'Trades maturing in window', value: String(FIXTURE_MOMENTS.filter((m) => m.type === 'maturity').length), asOf },
        { source: 'EQD master', field: 'Likely knock-outs (within 2% of barrier)', value: String(FIXTURE_MOMENTS.filter((m) => m.type === 'knockout').length), asOf },
        { source: 'Outstanding stock', field: 'Deliveries below strike', value: String(FIXTURE_MOMENTS.filter((m) => m.type === 'exercised').length), asOf },
        { source: 'Blotter', field: 'Clients idle 90+ days', value: String(FIXTURE_MOMENTS.filter((m) => m.type === 'idle').length), asOf },
        { source: 'RFQ log', field: 'Open RFQs', value: String(FIXTURE_MOMENTS.filter((m) => m.type === 'rfq').length), asOf },
      ];
      return reference.startsWith('client:')
        ? rows.map((r) => ({ ...r, field: `${r.field} (${reference.slice(7)})` }))
        : rows;
    });
  }

  requestLiveQuote(clientId: string, ideaId: string): Observable<QuoteRequestReceipt> {
    this.client(clientId);
    return this.respond(() => ({
      requestId: `RFQ-MOCK-${String(++this.quoteCounter).padStart(4, '0')}`,
      ideaId,
      sentAt: new Date().toISOString(),
      desk: 'SPE desk',
    }));
  }

  recordNotToday(_leadId: string): Observable<void> {
    return of(undefined).pipe(delay(0));
  }
}

function countMet(signals: readonly Signal[]): number {
  return signals.filter((s) => s.met).length;
}

/** Two plain ideas for clients without a curated set, built from their own concentration. */
function genericIdeaSet(client: FixtureClient) {
  const heaviest = client.concentration[0];
  const avoid = heaviest?.underlying ?? 'none';
  const pick = ['MSFT', 'GOOGL', 'AAPL', 'META', 'AMD'].filter((u) => u !== avoid);
  const idea = (id: string, a: string, b: string, tenor: string, ki: number, strike: number, coupon: number, reason: string): FixtureIdea => ({
    id: `${id}-${client.id}`,
    title: `${a} / ${b} worst-of · ${tenor}`,
    tenor,
    kiPct: ki,
    strikePct: strike,
    couponPct: coupon,
    signalsMet: ['moment', 'headroom'],
    concentration: { underlying: a, fromPct: 0, toPct: 6.5, limitPct: 25 },
    reason,
  });
  return {
    clientId: client.id,
    ideas: [
      idea('i-g1', pick[0], pick[1], '6M', 70, 88, 13.2, `Keeps away from ${avoid}, the largest holding.`),
      idea('i-g2', pick[2], pick[3], '3M', 72, 90, 11.6, 'Shorter tenor and a higher barrier for a cautious restart.'),
    ],
    rankedLower: [],
    callPrep: [
      `Open with what changed for ${client.name.split(' ')[0]} since the last trade.`,
      'Walk through idea #1 first; it adds no concentration.',
    ],
  };
}
