import { PARITY_RESULTS, ParityTopic } from '../parity/tableau-parity';
import { DOCUMENT, Injectable, inject } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';
import { currentScenario } from '../data/page-load';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { BOOK_CONCENTRATION, ROLLOVER_BASELINE_PCT, ROLLOVER_POCKETS, UNMET_DEMAND } from '../data/business.fixture';
import { FIXTURE_CLIENTS } from '../data/today.fixture';
import { TodayDataSource } from '../data/today-data-source';
import { MomentStrip } from '../models/today.models';
import { offsetLabel, shortDate } from '../time/business-calendar';
import { IdeaFinderDataSource } from '../ideas/idea-finder-data-source';
import { IdeaResults, NO_FILTERS } from '../ideas/idea-finder.models';
import { STARTER_PACKS } from '../ideas/idea-warehouse.fixture';
import { ClientContext } from '../models/today.models';
import { ChatDataSource } from './chat-data-source';
import { DECLINE_TEXT, FALLBACK_TEXT } from './chat-scope';
import { AnswerBlock, ChatAnswer, ChatQuestion, ClientRowsBlock } from './chat.models';

const SOURCES = ['EQD master', 'outstanding stock', 'RFQ log'];
const FALLBACK_FOLLOW_UPS = ['Where is rollover below 80% this month?', 'Who matures this week?', 'Which knock-outs are close to the barrier?'];

/** The Ideas tab opens a client's ideas with this pack ("Show rollover ideas", "See why in Ideas"); chat uses the same one. */
export const CALL_PREP_PACK = 'rollover';

// Question intents, shared word for word with the gateway (ChatService.java). Order matters: first match wins.
const ADVICE =
  /\b(should (i|we|he|she|they|the client|\w+) (buy|sell|invest|hold|switch|add|exit|get out)|buy or sell|recommend\w*|forecast|predict\w*|price target|what will \S+(?: \S+)? do|will \S+(?: \S+)? (go up|go down|rise|fall|drop|rally|crash)|is it a good (time|idea)|worth buying|good buy)\b/;
const HISTORY = /\b(trade|traded|trades|history|rfqs?|last 90)\b/;
const BRIEF = /\b(prepare|prep|before i call|know about|call with|tell me about|brief me|brief on|summary of|summari[sz]e|overview|update on|status of)\b/;
const ROLLOVER = /\broll(ed|s|ing)?[ -]?overs?\b/;
const CONCENTRATION = /concentrat|against limit|limits?\b|exposure|heaviest|book share|closest to (its |the )?limit/;
const UNMET = /not traded|quoted and not|unmet|demand|did ?n[o']t trade|didn't trade|unconverted|missed quotes|lost quotes/;
const MATURITY = /matur|expir|falling due|coming due/;
const KNOCKOUT = /knock|barrier|\bko\b/;

/**
 * Answers a few kinds of question from the same Today data the screens use, so the demo stays consistent:
 * call prep for one client, maturities this week, knock-outs near the barrier. Anything else gets suggestions.
 * In the real system Stork AI words the answer; the figures still come from computed data.
 */
/** What Chat says when the overnight data is empty. */
const NO_DATA_TEXT = "There is nothing in last night's data to answer from yet: no positions, quotes or clients. The overnight refresh may not have landed. Try again after 09:00, or check the data clock.";

@Injectable()
export class MockChatDataSource extends ChatDataSource {
  private readonly today = inject(TodayDataSource);
  private readonly config = inject(APP_CONFIG);
  private readonly document = inject(DOCUMENT);
  private readonly ideaFinder = inject(IdeaFinderDataSource);
  private counter = 0;

  ask(question: ChatQuestion): Observable<ChatAnswer> {
    const text = question.text.toLowerCase();
    const named = findClient(text);
    const clientId = named ?? question.clientId;
    const id = `a-${++this.counter}`;
    if (ADVICE.test(text)) {
      return this.decline(id, clientId);
    }
    if (currentScenario(this.config, this.document) === 'empty') {
      return this.noData(id);
    }
    if (UNMET.test(text)) {
      return this.unmetDemand(id);
    }
    if (HISTORY.test(text) && clientId) {
      return this.history(id, clientId);
    }
    if (BRIEF.test(text) && clientId) {
      return this.callPrep(id, clientId);
    }
    if (ROLLOVER.test(text)) {
      return this.rollover(id);
    }
    if (CONCENTRATION.test(text)) {
      return this.concentration(id);
    }
    if (MATURITY.test(text)) {
      return this.byType(id, 'maturity', text.includes('next week') ? 'next' : 'this');
    }
    if (KNOCKOUT.test(text)) {
      return this.byType(id, 'knockout', 'window');
    }
    if (named) {
      return this.callPrep(id, named);
    }
    return this.today.getMorningBrief('all').pipe(
      map((brief) => ({ id, fallback: true, businessDate: brief.businessDate, sources: [], blocks: [{ kind: 'text', text: FALLBACK_TEXT }], followUps: FALLBACK_FOLLOW_UPS })),
    );
  }

  /** Last night's data has not landed: say so plainly rather than answering from nothing. No figures, no sources. */
  private noData(id: string): Observable<ChatAnswer> {
    return this.today.getMorningBrief('all').pipe(
      map((brief) => ({ id, fallback: true, businessDate: brief.businessDate, sources: [], blocks: [{ kind: 'text', text: NO_DATA_TEXT }], followUps: [] })),
    );
  }

  /** Forecast or advice: say plainly that the tool does not do that, and offer facts instead. No figures, no sources. */
  private decline(id: string, clientId: string | null): Observable<ChatAnswer> {
    const client = clientId ? FIXTURE_CLIENTS.find((c) => c.id === clientId) : undefined;
    const first = client?.name.split(' ')[0];
    const followUps = first
      ? [`Brief me on ${first}`, `What did ${first} trade in the last 90 days?`, 'Top concentrations against limit']
      : ['Top concentrations against limit', 'What was quoted and not traded this week?', 'Who matures this week?'];
    return this.today
      .getMorningBrief('all')
      .pipe(map((brief) => ({ id, fallback: true, businessDate: brief.businessDate, sources: [], blocks: [{ kind: 'text', text: DECLINE_TEXT }], followUps })));
  }

  private businessAnswer(id: string, blocks: AnswerBlock[], followUps: string[], sources: string[], topic: ParityTopic): Observable<ChatAnswer> {
    return this.today
      .getMorningBrief('all')
      .pipe(map((brief) => ({ id, fallback: false, businessDate: brief.businessDate, sources, blocks, followUps, parity: PARITY_RESULTS[topic] })));
  }

  private rollover(id: string): Observable<ChatAnswer> {
    const pockets = [...ROLLOVER_POCKETS].sort((a, b) => a.rolloverPct - b.rolloverPct);
    const below = pockets.filter((p) => p.rolloverPct < ROLLOVER_BASELINE_PCT);
    const low = below[0];
    return this.businessAnswer(
      id,
      [
        {
          kind: 'text',
          text: below.length
            ? `Rollover is above the ${ROLLOVER_BASELINE_PCT}% baseline overall, but ${below.length} ${below.length === 1 ? 'pocket is' : 'pockets are'} below it this month. ${low.branch} · ${low.segment} is lowest at ${low.rolloverPct}% (${low.rolledThisMonth} of ${low.maturedThisMonth} rolled), with ${usd(low.maturingUsd)} maturing in the next 10 business days.`
            : `Every pocket is at or above the ${ROLLOVER_BASELINE_PCT}% rollover baseline this month.`,
        },
        {
          kind: 'table',
          title: 'Rollover this month, by branch and segment',
          columns: ['Branch', 'Segment', 'Rolled', 'Rollover', 'Maturing next 10 days'],
          numeric: [2, 3, 4],
          rows: pockets.map((p) => [p.branch, p.segment, `${p.rolledThisMonth} of ${p.maturedThisMonth}`, `${p.rolloverPct}%`, usd(p.maturingUsd)]),
          flagged: pockets.map((p, i) => (p.rolloverPct < ROLLOVER_BASELINE_PCT ? i : -1)).filter((i) => i >= 0),
        },
      ],
      ['Who matures this week?', 'What was quoted and not traded this week?'],
      ['EQD master', 'trades this month'],
      'rollover',
    );
  }

  private concentration(id: string): Observable<ChatAnswer> {
    const top = BOOK_CONCENTRATION[0];
    return this.businessAnswer(
      id,
      [
        { kind: 'text', text: `${top.underlying} is ${top.sharePct}% of all ELI outstanding against a ${top.limitPct}% limit, the closest name to its limit. Ideas that add ${top.underlying} rank lower and say why.` },
        { kind: 'concentration', title: 'Share of all ELI outstanding, by underlying', lines: BOOK_CONCENTRATION.map((c) => ({ ...c })) },
      ],
      ['What was quoted and not traded this week?', 'Who matures this week?'],
      ['EQD master', 'outstanding stock', 'name limits'],
      'concentration',
    );
  }

  private unmetDemand(id: string): Observable<ChatAnswer> {
    const rows = [...UNMET_DEMAND].sort((a, b) => b.quotes - b.traded - (a.quotes - a.traded));
    const digibank = UNMET_DEMAND.filter((d) => d.channel === 'digibank');
    const digiQuotes = digibank.reduce((s, d) => s + d.quotes, 0);
    const digiTraded = digibank.reduce((s, d) => s + d.traded, 0);
    return this.businessAnswer(
      id,
      [
        { kind: 'text', text: `${rows[0].underlying} had the most quotes that did not trade this week (${rows[0].quotes - rows[0].traded}). On digibank, ${digiQuotes} quotes led to ${digiTraded} trades; most asked for short tenors with high coupons.` },
        {
          kind: 'table',
          title: 'Quoted and not traded this week',
          columns: ['Underlying', 'Channel', 'Quotes', 'Traded', 'Most asked for'],
          numeric: [2, 3],
          rows: rows.map((d) => [d.underlying, d.channel === 'digibank' ? 'Digibank' : 'Advisory', String(d.quotes), String(d.traded), d.topAsk]),
        },
      ],
      ['Top concentrations against limit', 'Where is rollover below 80% this month?'],
      ['RFQ log', 'digibank quote log', 'blotter'],
      'unmet',
    );
  }

  private callPrep(id: string, clientId: string): Observable<ChatAnswer> {
    return forkJoin({
      brief: this.today.getMorningBrief('all'),
      context: this.today.getClientContext(clientId),
      ideas: this.ideaFinder
        .search({ filters: { ...NO_FILTERS, clientId }, signalIds: STARTER_PACKS.find((p) => p.id === CALL_PREP_PACK)!.signalIds })
        .pipe(catchError(() => of(null))),
    }).pipe(
      map(({ brief, context, ideas }) => {
        const lead = brief.leads.find((l) => l.clientId === clientId);
        const first = context.name.split(' ')[0];
        const blocks: AnswerBlock[] = [
          {
            kind: 'text',
            text: lead
              ? `${context.name} is in today's brief: ${lead.summary} ${lead.signals.filter((s) => s.met).length} of ${lead.signals.length} signals agree.`
              : `${context.name} is not in today's brief, so there is no dated moment today. Here is the client's book.`,
          },
          {
            kind: 'facts',
            items: [
              { label: 'ELI outstanding', value: usd(context.eliOutstandingUsd) },
              { label: 'Maturing in 10 days', value: usd(context.maturingUsd) },
              { label: 'Last trade', value: context.lastTradeDate ? shortDate(context.lastTradeDate) : 'None' },
              { label: 'Risk profile', value: String(context.riskProfile) },
            ],
          },
        ];
        if (context.concentration.length > 0) {
          blocks.push({ kind: 'concentration', title: 'Concentration, share of ELI outstanding', lines: context.concentration.map((c) => ({ underlying: c.underlying, sharePct: c.sharePct, limitPct: c.limitPct })) });
        }
        if (ideas && ideas.matches.length > 0) {
          blocks.push({
            kind: 'ideas',
            clientId,
            title: `Top ideas for USD ${Math.round(ideas.notionalUsd / 1000)}k, indicative`,
            ideas: ideas.matches.slice(0, 3).map((m) => ({
              id: m.id,
              title: m.title,
              tenor: `${m.tenorMonths}M`,
              couponPct: m.terms.couponPct,
              kiPct: m.terms.kiPct,
              concentration: m.effect ? `${m.effect.underlying} ${m.effect.fromPct.toFixed(1)}% → ${m.effect.toPct.toFixed(1)}%` : '',
            })),
          });
        }
        const facts = factsForRm(context, ideas);
        if (facts.length > 0) {
          blocks.push({ kind: 'bullets', title: 'Facts for the owning RM', items: facts });
        }
        return {
          id,
          fallback: false,
          businessDate: brief.businessDate,
          sources: SOURCES,
          blocks,
          followUps: [`What did ${first} trade in the last 90 days?`, 'Who matures this week?', 'Which knock-outs are close to the barrier?'],
          parity: PARITY_RESULTS.client,
        };
      }),
    );
  }

  private history(id: string, clientId: string): Observable<ChatAnswer> {
    return forkJoin({ brief: this.today.getMorningBrief('all'), context: this.today.getClientContext(clientId) }).pipe(
      map(({ brief, context }) => {
        const first = context.name.split(' ')[0];
        const outcomes = context.outcomes.map((o) => `${shortDate(o.date)} · ${o.label} · ${o.status.replace('-', ' ')}`);
        const rfqs = context.recentRfqs.map((r) => `${shortDate(r.date)} · ${r.description} · ${r.status.replace('-', ' ')}`);
        const blocks: AnswerBlock[] = [
          {
            kind: 'text',
            text: `${context.name}: last ELI trade ${context.lastTradeDate ? shortDate(context.lastTradeDate) : 'not on record'}, ${outcomes.length} ${outcomes.length === 1 ? 'lead' : 'leads'} in the last 90 days and ${rfqs.length} ${rfqs.length === 1 ? 'RFQ' : 'RFQs'} in the last 30.`,
          },
        ];
        if (outcomes.length) {
          blocks.push({ kind: 'bullets', title: 'Leads and outcomes, from the blotter', items: outcomes });
        }
        if (rfqs.length) {
          blocks.push({ kind: 'bullets', title: 'Recent RFQs', items: rfqs });
        }
        return { id, fallback: false, businessDate: brief.businessDate, sources: SOURCES, blocks, followUps: [`Brief me on ${first}`, 'Who matures this week?'], parity: PARITY_RESULTS.client };
      }),
    );
  }

  private byType(id: string, type: 'maturity' | 'knockout', window: 'this' | 'next' | 'window'): Observable<ChatAnswer> {
    return this.today.getMomentStrip('all').pipe(
      switchMap((strip) => this.today.getMorningBrief('all').pipe(map((brief) => ({ strip, brief })))),
      map(({ strip, brief }) => {
        const weekEnd = endOfWeekIndex(strip);
        const inWindow = (offset: number) => (window === 'this' ? offset <= weekEnd : window === 'next' ? offset > weekEnd : true);
        let moments = strip.moments.filter((m) => m.type === type && inWindow(m.offset)).sort((a, b) => a.offset - b.offset);
        // Nothing left this week: say so, and show what comes next instead of an empty answer.
        let leadIn = '';
        if (moments.length === 0 && window === 'this') {
          moments = strip.moments.filter((m) => m.type === type && m.offset > weekEnd).sort((a, b) => a.offset - b.offset);
          if (moments.length > 0) {
            leadIn = 'Nothing matures this week. ';
            window = 'next';
          }
        }
        const rows: ClientRowsBlock['rows'] = moments.map((m) => {
          const client = FIXTURE_CLIENTS.find((c) => c.id === m.clientId)!;
          const lead = brief.leads.find((l) => l.clientId === m.clientId && l.moment.type === type);
          return {
            clientId: m.clientId,
            name: client.name,
            type,
            when: `${shortDate(m.date)} · ${offsetLabel(m.offset)}`,
            amountUsd: type === 'maturity' ? client.maturingUsd : client.maturingUsd || null,
            note: lead ? `In today's brief · ${lead.signals.filter((s) => s.met).length}/6 signals` : 'Not in the brief',
          };
        });
        const label = type === 'maturity' ? (window === 'next' ? 'maturities next week' : 'maturities this week') : 'likely knock-outs in the next 10 business days';
        const total = rows.reduce((sum, r) => sum + (r.amountUsd ?? 0), 0);
        const blocks: AnswerBlock[] = [
          {
            kind: 'text',
            text:
              rows.length === 0
                ? `No ${label} across the business.`
                : `${leadIn}${rows.length} ${rows.length === 1 ? label.replace('maturities', 'maturity').replace('knock-outs', 'knock-out') : label}${total ? `, ${usd(total)} in all` : ''}. ${rows[0].name} is first, ${rows[0].when.split(' · ')[0]}.`,
          },
        ];
        if (rows.length > 0) {
          blocks.push({ kind: 'clients', title: type === 'maturity' ? 'Maturing' : 'Close to the barrier', rows });
        }
        const followUps = rows.slice(0, 2).map((r) => `Brief me on ${r.name.split(' ')[0]}`);
        followUps.push(type === 'maturity' ? 'Which knock-outs are close to the barrier?' : 'Who matures this week?');
        return { id, fallback: false, businessDate: brief.businessDate, sources: SOURCES, blocks, followUps, parity: PARITY_RESULTS[type === 'maturity' ? 'maturities' : 'knockouts'] };
      }),
    );
  }
}

/**
 * Plain facts for the owning RM, from the client's book and the same ranking the Ideas tab shows.
 * Facts only: nothing here tells anyone what to sell. Same sentences as the gateway.
 */
function factsForRm(context: ClientContext, ideas: IdeaResults | null): string[] {
  const out: string[] = [];
  if (context.maturingUsd > 0) {
    out.push(`${usd(context.maturingUsd)} matures in the next 10 business days.`);
  }
  const top = [...context.concentration].sort((a, b) => b.sharePct - a.sharePct)[0];
  if (top) {
    out.push(`Largest holding is ${top.underlying} at ${top.sharePct}% of the client's ELI book, against a ${top.limitPct}% limit.`);
  }
  if (ideas && ideas.matches.length > 0) {
    const m = ideas.matches[0];
    out.push(`Idea 1 meets ${m.met} of ${m.checks.length} rollover signals. The evidence for each is under Why in Ideas.`);
  }
  if (ideas && ideas.hiddenByLimits.length > 0) {
    const n = ideas.hiddenByLimits.length;
    out.push(`${n} ${n === 1 ? 'idea is' : 'ideas are'} hidden because ${n === 1 ? 'it' : 'they'} would take a holding over its limit.`);
  }
  return out;
}

/** A client named in the question, matched on family name or full name. */
function findClient(text: string): string | null {
  const hit = FIXTURE_CLIENTS.find((c) => {
    const parts = c.name.toLowerCase().split(' ');
    return text.includes(c.name.toLowerCase()) || new RegExp(`\\b${parts[0]}\\b`).test(text);
  });
  return hit?.id ?? null;
}

/** Index of the last strip day in the current week (the day before the first Monday after today). */
function endOfWeekIndex(strip: MomentStrip): number {
  const days = strip.days;
  for (let i = 1; i < days.length; i++) {
    if (new Date(`${days[i].date}T00:00:00Z`).getUTCDay() < new Date(`${days[i - 1].date}T00:00:00Z`).getUTCDay()) {
      return i - 1;
    }
  }
  return days.length - 1;
}

function usd(value: number): string {
  if (value >= 1_000_000) {
    return `USD ${(value / 1_000_000).toFixed(2)}m`;
  }
  return value === 0 ? 'USD 0' : `USD ${Math.round(value / 1000)}k`;
}

