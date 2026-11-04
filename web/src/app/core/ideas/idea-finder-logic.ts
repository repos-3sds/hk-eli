/**
 * Pure Idea Finder logic: read plain words into filters, apply hard filters, check signals, rank by confluence.
 * Shared by the mock data source and its tests; the gateway does the same work server-side.
 */
import { FixtureClient } from '../data/today.fixture';
import { ConcentrationEffect, FilterBlocker, IdeaFilters, IdeaMatch, IdeaQuery, NO_FILTERS, ReadIntent, SignalCheck } from './idea-finder.models';
import { CONCENTRATION_LIMIT_PCT, DEFAULT_NOTIONAL_USD, IDEA_SIGNALS, WarehouseIdea } from './idea-warehouse.fixture';

const STOP_WORDS = new Set(['a', 'an', 'the', 'for', 'and', 'or', 'with', 'to', 'of', 'in', 'on', 'me', 'my', 'some', 'ideas', 'idea', 'eli', 'elis', 'find', 'show', 'want', 'wants', 'client', 'please', 'around', 'about', 'at', 'least', 'than', 'is', 'he', 'she', 'they', 'that', 'who']);

/** Reads "6M, 15% coupon, KI 65 or lower, no more NVDA for Chan" into hard filters and a starter pack. */
export function readIntent(text: string, tickers: readonly string[], clients: readonly FixtureClient[]): ReadIntent {
  const lower = text.toLowerCase();
  const used = new Set<string>();
  const mark = (match: RegExpMatchArray | null) => match?.[0].split(/\s+/).forEach((w) => used.add(w.replace(/[^a-z0-9.%]/g, '')));

  const tenor = lower.match(/\b(\d{1,2})\s*(m|mo|mth|months?)\b/);
  mark(tenor);
  const coupon = lower.match(/(\d{1,2}(?:\.\d)?)\s*%?\s*(?:p\.?a\.?\s*)?coupon|coupon\s*(?:of|above|over|at least|>=?)?\s*(\d{1,2}(?:\.\d)?)\s*%?/);
  mark(coupon);
  const ki = lower.match(/\b(?:ki|knock-?in)\s*(?:at|of|below|under|at most|<=?)?\s*(\d{2})\s*%?(?:\s*or\s*(?:lower|less|below))?/);
  mark(ki);

  const exclude: string[] = [];
  const include: string[] = [];
  for (const t of tickers) {
    const tl = t.toLowerCase();
    const neg = new RegExp(`\\b(no more|no|avoid|without|not|except|exclude|ex)\\s+(?:\\w+\\s+)?${tl}\\b`);
    const pos = new RegExp(`\\b${tl}\\b`);
    if (neg.test(lower)) {
      exclude.push(t);
      mark(lower.match(neg));
    } else if (pos.test(lower)) {
      include.push(t);
      used.add(tl);
    }
  }

  const client = clients.find((c) => {
    const family = c.name.split(' ')[0].toLowerCase();
    return lower.includes(c.name.toLowerCase()) || new RegExp(`\\b${family}\\b`).test(lower);
  });
  if (client) {
    client.name.toLowerCase().split(' ').forEach((w) => used.add(w));
  }

  let packId: string | null = null;
  const packWords: [RegExp, string][] = [
    [/\b(roll ?over|maturing|matures|reinvest)\b/, 'rollover'],
    [/\b(safe|safer|defensive|protect\w*|conservative|sleep)\b/, 'defensive'],
    [/\b(yield|high coupon|income|juicy)\b/, 'yield'],
    [/\b(diversif\w*|spread|concentrat\w*)\b/, 'diversify'],
    [/\b(popular|busy|desk|everyone)\b/, 'desk'],
  ];
  for (const [re, id] of packWords) {
    const m = lower.match(re);
    if (m) {
      packId = id;
      mark(m);
      break;
    }
  }

  const filters: IdeaFilters = {
    ...NO_FILTERS,
    tenorMonths: tenor ? Number(tenor[1]) : null,
    minCouponPct: coupon ? Number(coupon[1] ?? coupon[2]) : null,
    maxKiPct: ki ? Number(ki[1]) : null,
    include,
    exclude,
    clientId: client?.id ?? null,
  };
  const ignored = lower
    .split(/[\s,;]+/)
    .map((w) => w.replace(/[^a-z0-9.%-]/g, ''))
    .filter((w) => w && !used.has(w) && !STOP_WORDS.has(w) && !/^\d/.test(w) && !['coupon', 'ki', 'knock-in', 'more', 'no', 'lower', 'below', 'or', 'under', 'p.a.', 'pa', 'tenor', 'months', 'month'].includes(w));
  return { filters, packId, ignored: [...new Set(ignored)] };
}

export function passesFilters(idea: WarehouseIdea, f: IdeaFilters): boolean {
  if (f.tenorMonths !== null && idea.tenorMonths !== f.tenorMonths) return false;
  if (f.minCouponPct !== null && idea.couponPct < f.minCouponPct) return false;
  if (f.maxKiPct !== null && idea.kiPct > f.maxKiPct) return false;
  if (f.exclude.some((t) => idea.underlyings.includes(t))) return false;
  if (f.include.length > 0 && !f.include.some((t) => idea.underlyings.includes(t))) return false;
  return true;
}

/** For each hard filter that is set: how many ideas would pass with only that filter removed. */
export function filterBlockers(warehouse: readonly WarehouseIdea[], f: IdeaFilters): FilterBlocker[] {
  const candidates: [FilterBlocker['key'], string, Partial<IdeaFilters>][] = [];
  if (f.tenorMonths !== null) candidates.push(['tenorMonths', `Tenor ${f.tenorMonths}M`, { tenorMonths: null }]);
  if (f.minCouponPct !== null) candidates.push(['minCouponPct', `Coupon at least ${f.minCouponPct}%`, { minCouponPct: null }]);
  if (f.maxKiPct !== null) candidates.push(['maxKiPct', `KI at most ${f.maxKiPct}%`, { maxKiPct: null }]);
  if (f.include.length) candidates.push(['include', `Only ${f.include.join(', ')}`, { include: [] }]);
  if (f.exclude.length) candidates.push(['exclude', `No ${f.exclude.join(', ')}`, { exclude: [] }]);
  return candidates
    .map(([key, label, relax]) => ({ key, label, wouldPass: warehouse.filter((w) => passesFilters(w, { ...f, ...relax })).length }))
    .sort((a, b) => b.wouldPass - a.wouldPass);
}

/** Where the trade would take the client's most affected underlying. */
export function concentrationEffect(idea: WarehouseIdea, client: FixtureClient, notionalUsd: number): ConcentrationEffect {
  const out = client.eliOutstandingUsd;
  const total = out + notionalUsd;
  const per = notionalUsd / idea.underlyings.length;
  const effects = idea.underlyings.map((u) => {
    const fromPct = client.concentration.find((c) => c.underlying === u)?.sharePct ?? 0;
    const toPct = total > 0 ? ((fromPct / 100) * out + per) / total * 100 : 100;
    return { underlying: u, fromPct, toPct: Math.round(toPct * 10) / 10, limitPct: CONCENTRATION_LIMIT_PCT };
  });
  return effects.reduce((a, b) => (b.toPct > a.toPct ? b : a));
}

export function couponLine(warehouse: readonly WarehouseIdea[]): number {
  const sorted = [...warehouse].map((w) => w.couponPct).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.75)];
}

export function checkSignal(signalId: string, idea: WarehouseIdea, ctx: { couponLine: number; client: FixtureClient | null; notionalUsd: number }): SignalCheck {
  const signal = IDEA_SIGNALS.find((s) => s.id === signalId)!;
  const result = (met: boolean, evidence: string): SignalCheck => ({ signalId, met, evidence, source: signal.source });
  const c = ctx.client;
  switch (signalId) {
    case 'top-coupon':
      return result(idea.couponPct >= ctx.couponLine, `${idea.couponPct}% against the ${ctx.couponLine}% top-quartile line`);
    case 'coupon-up':
      return result(idea.couponChangeBp >= 50, `${idea.couponChangeBp >= 0 ? '+' : ''}${(idea.couponChangeBp / 100).toFixed(2)} points on last week`);
    case 'vol-rich':
      return result(idea.volRank >= 70, `Vol rank ${idea.volRank} of 100`);
    case 'rm-traded':
      return result(idea.rmTrades >= 3, `${idea.rmTrades} HK RMs this week`);
    case 'rfq-busy':
      return result(idea.rfqs5d >= 10, `${idea.rfqs5d} RFQs in 5 days`);
    case 'fills':
      return result(idea.fillRatePct >= 60, `${idea.fillRatePct}% of RFQs traded`);
    case 'deep-ki':
      return result(idea.kiPct <= 65, `KI ${idea.kiPct}%`);
    case 'correlated':
      return result(idea.correlation >= 0.7, idea.underlyings.length === 1 ? 'Single stock' : `Correlation ${idea.correlation.toFixed(2)}`);
    case 'no-earnings':
      return result(idea.earningsInDays > 20, `Next earnings in ${idea.earningsInDays} business days`);
    case 'headroom': {
      if (!c) return result(false, 'Pick a client');
      const e = concentrationEffect(idea, c, ctx.notionalUsd);
      return result(e.toPct <= e.limitPct, `${e.underlying} ${e.fromPct.toFixed(1)}% → ${e.toPct.toFixed(1)}%, limit ${e.limitPct}%`);
    }
    case 'familiar': {
      if (!c) return result(false, 'Pick a client');
      const held = idea.underlyings.filter((u) => c.concentration.some((x) => x.underlying === u));
      return result(held.length > 0, held.length ? `Already holds ${held.join(', ')}` : 'Holds none of these');
    }
    case 'not-top': {
      if (!c) return result(false, 'Pick a client');
      const top = [...c.concentration].sort((a, b) => b.sharePct - a.sharePct)[0];
      if (!top) return result(true, 'No ELI outstanding');
      return result(!idea.underlyings.includes(top.underlying), `Largest holding is ${top.underlying} at ${top.sharePct}%`);
    }
    default:
      return result(false, 'Unknown signal');
  }
}

/** Filters, checks and ranks: ideas within the client's limits first, then most signals met, then the higher coupon. */
export function rankIdeas(
  warehouse: readonly WarehouseIdea[],
  query: IdeaQuery,
  client: FixtureClient | null,
  pricedAt: string,
): { matches: IdeaMatch[]; passed: number; notionalUsd: number } {
  const notionalUsd = client && client.maturingUsd > 0 ? client.maturingUsd : DEFAULT_NOTIONAL_USD;
  const ctx = { couponLine: couponLine(warehouse), client, notionalUsd };
  const passed = warehouse.filter((w) => passesFilters(w, query.filters));
  const matches = passed.map((w): IdeaMatch => {
    const checks = query.signalIds.map((id) => checkSignal(id, w, ctx));
    return {
      id: w.id,
      title: `${w.underlyings.join(' / ')}${w.underlyings.length > 1 ? ' worst-of' : ''} · ${w.tenorMonths}M`,
      underlyings: w.underlyings,
      tenorMonths: w.tenorMonths,
      terms: { kiPct: w.kiPct, strikePct: w.strikePct, couponPct: w.couponPct },
      checks,
      met: checks.filter((c) => c.met).length,
      effect: client ? concentrationEffect(w, client, notionalUsd) : null,
      pricedAt,
    };
  });
  // An idea that would take the client over the concentration limit is never offered first, however many signals it meets.
  const breaches = (m: IdeaMatch) => (m.effect && m.effect.toPct > m.effect.limitPct ? 1 : 0);
  matches.sort((a, b) => breaches(a) - breaches(b) || b.met - a.met || b.terms.couponPct - a.terms.couponPct);
  return { matches, passed: passed.length, notionalUsd };
}

export const ALL_TICKERS = [...new Set(['NVDA', 'AMD', 'META', 'MSFT', 'GOOGL', 'AVGO', 'AAPL', 'TSLA', 'AMZN', 'TSM', 'NFLX', 'JPM', 'GS', 'BABA', 'TCEHY'])];
