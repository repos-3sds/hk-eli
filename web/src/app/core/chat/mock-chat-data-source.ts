import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { FIXTURE_CLIENTS } from '../data/today.fixture';
import { TodayDataSource } from '../data/today-data-source';
import { MomentStrip } from '../models/today.models';
import { offsetLabel, shortDate } from '../time/business-calendar';
import { ChatDataSource } from './chat-data-source';
import { AnswerBlock, ChatAnswer, ChatQuestion, ClientRowsBlock } from './chat.models';

const SOURCES = ['EQD master', 'outstanding stock', 'RFQ log'];
const FALLBACK_FOLLOW_UPS = ['Who matures this week?', 'Which knock-outs are close to the barrier?', 'Prepare me for my call with Chan'];

/**
 * Answers a few kinds of question from the same Today data the screens use, so the demo stays consistent:
 * call prep for one client, maturities this week, knock-outs near the barrier. Anything else gets suggestions.
 * In the real system Stork AI words the answer; the figures still come from computed data.
 */
@Injectable()
export class MockChatDataSource extends ChatDataSource {
  private readonly today = inject(TodayDataSource);
  private counter = 0;

  ask(question: ChatQuestion): Observable<ChatAnswer> {
    const text = question.text.toLowerCase();
    const named = findClient(text);
    const id = `a-${++this.counter}`;
    if (/\b(trade|traded|history|rfqs?|last 90)\b/.test(text) && (named ?? question.clientId)) {
      return this.history(id, (named ?? question.clientId)!);
    }
    if (/\b(prepare|prep|before i call|know about|call with|tell me about|brief me)\b/.test(text) && (named ?? question.clientId)) {
      return this.callPrep(id, (named ?? question.clientId)!);
    }
    if (/matur/.test(text)) {
      return this.byType(id, 'maturity', text.includes('next week') ? 'next' : 'this');
    }
    if (/knock|barrier|\bko\b/.test(text)) {
      return this.byType(id, 'knockout', 'window');
    }
    if (named) {
      return this.callPrep(id, named);
    }
    return this.today.getMorningBrief('my-book').pipe(
      map((brief) => ({
        id,
        fallback: true,
        businessDate: brief.businessDate,
        sources: SOURCES,
        blocks: [{ kind: 'text', text: 'I can only answer a few kinds of question in this demo: a call prep for one client, maturities this week or next, and knock-outs close to the barrier. Try one of these.' }],
        followUps: FALLBACK_FOLLOW_UPS,
      })),
    );
  }

  private callPrep(id: string, clientId: string): Observable<ChatAnswer> {
    return forkJoin({
      brief: this.today.getMorningBrief('team'),
      context: this.today.getClientContext(clientId),
      ideas: this.today.getIdeas(clientId).pipe(catchError(() => of(null))),
    }).pipe(
      map(({ brief, context, ideas }) => {
        const lead = brief.leads.find((l) => l.clientId === clientId);
        const first = context.name.split(' ')[0];
        const blocks: AnswerBlock[] = [
          {
            kind: 'text',
            text: lead
              ? `${context.name} is in today's brief: ${lead.summary} ${lead.signals.filter((s) => s.met).length} of ${lead.signals.length} signals agree.`
              : `${context.name} is not in today's brief, so there is no dated reason to call today. Here is the book before you do.`,
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
        if (ideas && ideas.ideas.length > 0) {
          blocks.push({
            kind: 'ideas',
            clientId,
            title: `Top ideas for USD ${Math.round(ideas.amountUsd / 1000)}k, indicative`,
            ideas: ideas.ideas.slice(0, 3).map((i) => ({
              id: i.id,
              title: i.title,
              tenor: i.tenor,
              couponPct: i.terms.couponPct,
              kiPct: i.terms.kiPct,
              concentration: `${i.concentration.underlying} ${i.concentration.fromPct.toFixed(1)}% → ${i.concentration.toPct.toFixed(1)}%`,
            })),
          });
          if (ideas.callPrep.length > 0) {
            blocks.push({ kind: 'bullets', title: 'Talking points', items: ideas.callPrep });
          }
        }
        return {
          id,
          fallback: false,
          businessDate: brief.businessDate,
          sources: SOURCES,
          blocks,
          followUps: [`What did ${first} trade in the last 90 days?`, 'Who matures this week?', 'Which knock-outs are close to the barrier?'],
        };
      }),
    );
  }

  private history(id: string, clientId: string): Observable<ChatAnswer> {
    return forkJoin({ brief: this.today.getMorningBrief('team'), context: this.today.getClientContext(clientId) }).pipe(
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
        return { id, fallback: false, businessDate: brief.businessDate, sources: SOURCES, blocks, followUps: [`Prepare me for my call with ${first}`, 'Who matures this week?'] };
      }),
    );
  }

  private byType(id: string, type: 'maturity' | 'knockout', window: 'this' | 'next' | 'window'): Observable<ChatAnswer> {
    return this.today.getMomentStrip('my-book').pipe(
      switchMap((strip) => this.today.getMorningBrief('my-book').pipe(map((brief) => ({ strip, brief })))),
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
                ? `No ${label} in your book.`
                : `${leadIn}${rows.length} ${rows.length === 1 ? label.replace('maturities', 'maturity').replace('knock-outs', 'knock-out') : label}${total ? `, USD ${Math.round(total / 1000)}k in all` : ''}. ${rows[0].name} is first, ${rows[0].when.split(' · ')[0]}.`,
          },
        ];
        if (rows.length > 0) {
          blocks.push({ kind: 'clients', title: type === 'maturity' ? 'Maturing' : 'Close to the barrier', rows });
        }
        const followUps = rows.slice(0, 2).map((r) => `Prepare me for my call with ${r.name.split(' ')[0]}`);
        followUps.push(type === 'maturity' ? (window === 'next' ? 'Who matures this week?' : 'Who matures next week?') : 'Who matures this week?');
        return { id, fallback: false, businessDate: brief.businessDate, sources: SOURCES, blocks, followUps };
      }),
    );
  }
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

