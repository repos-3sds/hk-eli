/**
 * The Business Update (R2): the monthly Tableau routine as 14 sections, sliced by the same scope as Today.
 * Pure functions over the demo business data, so the figures agree with Today's headline and pockets.
 * Every figure is invented. Parity with the real Tableau views is checked once that list is shared.
 */
import { BOOK_CONCENTRATION, ROLLOVER_BASELINE_PCT, ROLLOVER_POCKETS, UNMET_DEMAND, ownerOf } from '../data/business.fixture';
import { FIXTURE_CLIENTS, FIXTURE_MOMENTS } from '../data/today.fixture';
import { BookScope, scopeLabel } from '../models/today.models';
import { aggregatesCover, matchesAggregate, matchesScope } from '../models/scope';
import { LinkedConversion } from '../handoff/handoff.models';

export interface BusinessRow {
  readonly branch: string;
  readonly segment: string;
  readonly channel: 'advisory' | 'digibank';
  readonly notionalMtdUsd: number;
  readonly notionalPrevUsd: number;
  readonly trades: number;
  readonly rfqs: number;
  readonly rfqsTraded: number;
  readonly matured: number;
  readonly rolled: number;
  readonly activeClients: number;
  readonly idleClients: number;
}

/** Month to date by branch and segment. Matured and rolled agree with the rollover pockets on Today. */
export const BUSINESS_ROWS: readonly BusinessRow[] = [
  { branch: 'Central', segment: 'Treasure Private', channel: 'advisory', notionalMtdUsd: 18_400_000, notionalPrevUsd: 15_200_000, trades: 46, rfqs: 120, rfqsTraded: 41, matured: 34, rolled: 30, activeClients: 210, idleClients: 38 },
  { branch: 'Central', segment: 'Treasures', channel: 'advisory', notionalMtdUsd: 11_200_000, notionalPrevUsd: 12_000_000, trades: 39, rfqs: 98, rfqsTraded: 33, matured: 28, rolled: 24, activeClients: 260, idleClients: 51 },
  { branch: 'Kwun Tong', segment: 'Treasures', channel: 'advisory', notionalMtdUsd: 6_100_000, notionalPrevUsd: 8_300_000, trades: 22, rfqs: 75, rfqsTraded: 19, matured: 11, rolled: 5, activeClients: 180, idleClients: 64 },
  { branch: 'Mong Kok', segment: 'Treasures', channel: 'advisory', notionalMtdUsd: 7_400_000, notionalPrevUsd: 7_100_000, trades: 27, rfqs: 81, rfqsTraded: 24, matured: 9, rolled: 6, activeClients: 190, idleClients: 47 },
  { branch: 'Tsim Sha Tsui', segment: 'Treasures', channel: 'advisory', notionalMtdUsd: 8_000_000, notionalPrevUsd: 7_600_000, trades: 29, rfqs: 70, rfqsTraded: 25, matured: 8, rolled: 6, activeClients: 170, idleClients: 40 },
  { branch: 'Digibank', segment: 'Self-directed', channel: 'digibank', notionalMtdUsd: 9_600_000, notionalPrevUsd: 8_800_000, trades: 140, rfqs: 520, rfqsTraded: 71, matured: 50, rolled: 41, activeClients: 640, idleClients: 120 },
];

export const TOP_UNDERLYINGS: readonly { underlying: string; notionalUsd: number; trades: number }[] = [
  { underlying: 'NVDA', notionalUsd: 14_900_000, trades: 92 },
  { underlying: 'TSLA', notionalUsd: 9_800_000, trades: 71 },
  { underlying: 'AMD', notionalUsd: 7_300_000, trades: 48 },
  { underlying: 'META', notionalUsd: 5_200_000, trades: 33 },
  { underlying: '0700.HK', notionalUsd: 4_100_000, trades: 29 },
];

export const TENOR_KI_MIX: readonly { tenor: string; sharePct: number; avgKiPct: number; avgCouponPct: number }[] = [
  { tenor: '3M', sharePct: 41, avgKiPct: 68, avgCouponPct: 19.2 },
  { tenor: '6M', sharePct: 44, avgKiPct: 65, avgCouponPct: 16.4 },
  { tenor: '9M', sharePct: 9, avgKiPct: 64, avgCouponPct: 13.1 },
  { tenor: '12M', sharePct: 6, avgKiPct: 62, avgCouponPct: 11.0 },
];

export interface UpdateFigure {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
  readonly tone?: 'up' | 'down' | 'warn';
}

export interface UpdateTable {
  readonly columns: readonly string[];
  readonly numeric: readonly boolean[];
  readonly rows: readonly (readonly string[])[];
  /** Index of rows to flag (for example below the baseline). */
  readonly flagged?: readonly number[];
}

export interface UpdateSection {
  readonly id: string;
  readonly title: string;
  /** One or two plain sentences, computed from the figures. */
  readonly summary: string;
  readonly figures?: readonly UpdateFigure[];
  readonly table?: UpdateTable;
  readonly source: string;
  /** Shown for the whole business even when a scope is chosen (book-level data). */
  readonly wholeBusinessOnly: boolean;
  /** A question to take to Chat. */
  readonly ask: string;
}

export interface BusinessUpdate {
  readonly scope: BookScope;
  readonly scopeName: string;
  readonly dataDate: string;
  readonly sections: readonly UpdateSection[];
}

export function rowsInScope(scope: BookScope): BusinessRow[] {
  return BUSINESS_ROWS.filter((r) => matchesAggregate(r, scope));
}

function pocketsInScope(scope: BookScope) {
  return ROLLOVER_POCKETS.filter((p) => matchesAggregate(p, scope));
}

function momentsInScope(scope: BookScope) {
  return FIXTURE_MOMENTS.filter((m) => {
    const owner = ownerOf(m.clientId);
    const client = FIXTURE_CLIENTS.find((c) => c.id === m.clientId);
    return matchesScope(
      { branch: owner?.branch, segment: client?.segment, channel: owner?.channel, rmName: owner?.rmName, underlyings: client?.concentration.map((c) => c.underlying) },
      scope,
    );
  });
}

export function usdM(v: number): string {
  return v >= 1_000_000 ? `USD ${(v / 1_000_000).toFixed(1)}m` : `USD ${Math.round(v / 1000)}k`;
}

function pct(n: number, d: number): number {
  return d ? Math.round((n / d) * 100) : 0;
}

const sum = (rows: readonly BusinessRow[], k: keyof BusinessRow) => rows.reduce((s, r) => s + (r[k] as number), 0);

export function buildBusinessUpdate(scope: BookScope, dataDate: string, conversion: LinkedConversion): BusinessUpdate {
  const rows = rowsInScope(scope);
  const name = scopeLabel(scope);
  // RM and underlying scopes can't cut figures kept by branch and segment: those sections show the whole business.
  const coarse = !aggregatesCover(scope);
  const clientWhere = scope === 'all' ? 'the whole business' : name;
  const where = coarse ? 'the whole business' : clientWhere;
  const notional = sum(rows, 'notionalMtdUsd');
  const prev = sum(rows, 'notionalPrevUsd');
  const change = prev ? Math.round(((notional - prev) / prev) * 100) : 0;
  const trades = sum(rows, 'trades');
  const matured = sum(rows, 'matured');
  const rolled = sum(rows, 'rolled');
  const rollover = pct(rolled, matured);
  const rfqs = sum(rows, 'rfqs');
  const rfqsTraded = sum(rows, 'rfqsTraded');
  const qtt = pct(rfqsTraded, rfqs);
  const pockets = pocketsInScope(scope);
  const below = pockets.filter((p) => p.rolloverPct < p.baselinePct).sort((a, b) => a.rolloverPct - b.rolloverPct);
  const maturing = pockets.reduce((s, p) => s + p.maturingUsd, 0);
  const moments = momentsInScope(scope);
  const count = (t: string) => moments.filter((m) => m.type === t).length;
  const active = sum(rows, 'activeClients');
  const idle = sum(rows, 'idleClients');
  const branches = [...new Set(rows.map((r) => r.branch))];

  const sections: UpdateSection[] = [
    {
      id: 'headline',
      title: 'Headline',
      summary: `${usdM(notional)} traded month to date in ${where}, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% on last month. Rollover is ${rollover}% against the ${ROLLOVER_BASELINE_PCT}% baseline${below.length ? `, with ${below.length} ${below.length === 1 ? 'pocket' : 'pockets'} below it` : ''}.`,
      figures: [
        { label: 'Traded MTD', value: usdM(notional), note: `${change >= 0 ? '+' : ''}${change}% on last month`, tone: change >= 0 ? 'up' : 'down' },
        { label: 'Rollover', value: `${rollover}%`, note: `baseline ${ROLLOVER_BASELINE_PCT}%`, tone: rollover < ROLLOVER_BASELINE_PCT ? 'warn' : 'up' },
        { label: 'Quote to trade', value: `${qtt}%`, note: `${rfqsTraded} of ${rfqs} RFQs` },
        { label: 'Maturing, 10 days', value: usdM(maturing) },
      ],
      source: 'Blotter, RFQ log, EQD master',
      wholeBusinessOnly: coarse,
      ask: `Summarise this month for ${where}`,
    },
    {
      id: 'traded',
      title: 'Traded this month',
      summary: `${trades} trades for ${usdM(notional)}. Last month at the same point: ${usdM(prev)}.`,
      figures: [
        { label: 'Notional MTD', value: usdM(notional), tone: change >= 0 ? 'up' : 'down', note: `${change >= 0 ? '+' : ''}${change}%` },
        { label: 'Trades', value: String(trades) },
        { label: 'Average ticket', value: usdM(trades ? notional / trades : 0) },
      ],
      source: 'Blotter',
      wholeBusinessOnly: coarse,
      ask: `How does traded notional compare with last month in ${where}?`,
    },
    {
      id: 'rollover',
      title: 'Rollover against the baseline',
      summary: below.length
        ? `${rolled} of ${matured} maturities rolled (${rollover}%). Lowest: ${below.map((p) => `${p.branch} ${p.segment} ${p.rolloverPct}%`).join(', ')}.`
        : `${rolled} of ${matured} maturities rolled (${rollover}%). No pocket is below ${ROLLOVER_BASELINE_PCT}%.`,
      table: {
        columns: ['Pocket', 'Matured', 'Rolled', 'Rollover'],
        numeric: [false, true, true, true],
        rows: [...pockets].sort((a, b) => a.rolloverPct - b.rolloverPct).map((p) => [`${p.branch} · ${p.segment}`, String(p.maturedThisMonth), String(p.rolledThisMonth), `${p.rolloverPct}%`]),
        flagged: [...pockets].sort((a, b) => a.rolloverPct - b.rolloverPct).map((p, i) => (p.rolloverPct < p.baselinePct ? i : -1)).filter((i) => i >= 0),
      },
      source: 'Blotter, maturity schedule',
      wholeBusinessOnly: coarse,
      ask: `Where is rollover below ${ROLLOVER_BASELINE_PCT}% this month?`,
    },
    {
      id: 'maturing',
      title: 'Maturing in the next 10 business days',
      summary: `${usdM(maturing)} matures across ${pockets.length} ${pockets.length === 1 ? 'pocket' : 'pockets'}; ${usdM(below.reduce((s, p) => s + p.maturingUsd, 0))} of it sits in pockets below the rollover line.`,
      table: {
        columns: ['Pocket', 'Maturing', 'Rollover so far'],
        numeric: [false, true, true],
        rows: [...pockets].sort((a, b) => b.maturingUsd - a.maturingUsd).map((p) => [`${p.branch} · ${p.segment}`, usdM(p.maturingUsd), `${p.rolloverPct}%`]),
      },
      source: 'Maturity schedule',
      wholeBusinessOnly: coarse,
      ask: 'Who matures this week?',
    },
    {
      id: 'quote-to-trade',
      title: 'Quote to trade',
      summary: `${rfqsTraded} of ${rfqs} RFQs traded (${qtt}%). There is no agreed baseline yet, so this is shown without a target.`,
      table: {
        columns: ['Branch', 'RFQs', 'Traded', 'Rate'],
        numeric: [false, true, true, true],
        rows: branches.map((b) => {
          const r = rows.filter((x) => x.branch === b);
          return [b, String(sum(r, 'rfqs')), String(sum(r, 'rfqsTraded')), `${pct(sum(r, 'rfqsTraded'), sum(r, 'rfqs'))}%`];
        }),
      },
      source: 'RFQ log',
      wholeBusinessOnly: coarse,
      ask: 'What was quoted and not traded this week?',
    },
    {
      id: 'unmet',
      title: 'Quoted, not traded',
      summary: 'Where clients asked and did not trade this week. Digibank is self-directed, so the ask is the parameter set itself.',
      table: {
        columns: ['Underlying', 'Channel', 'Quotes', 'Traded', 'Most asked'],
        numeric: [false, false, true, true, false],
        rows: UNMET_DEMAND.filter((u) => scope !== 'channel:digibank' || u.channel === 'digibank').map((u) => [u.underlying, u.channel === 'digibank' ? 'Digibank' : 'Advisory', String(u.quotes), String(u.traded), u.topAsk]),
      },
      source: 'RFQ log, digibank quote log',
      wholeBusinessOnly: scope !== 'all' && scope !== 'channel:digibank',
      ask: 'What was quoted on digibank and not traded this week?',
    },
    {
      id: 'branches',
      title: 'Branches',
      summary: `${branches.length} ${branches.length === 1 ? 'branch' : 'branches'} in ${where}. Ranked by notional this month.`,
      table: {
        columns: ['Branch', 'Notional MTD', 'Trades', 'Rollover'],
        numeric: [false, true, true, true],
        rows: branches
          .map((b) => {
            const r = rows.filter((x) => x.branch === b);
            return { b, n: sum(r, 'notionalMtdUsd'), t: sum(r, 'trades'), ro: pct(sum(r, 'rolled'), sum(r, 'matured')) };
          })
          .sort((a, b) => b.n - a.n)
          .map((x) => [x.b, usdM(x.n), String(x.t), `${x.ro}%`]),
      },
      source: 'Blotter, EQD master',
      wholeBusinessOnly: coarse,
      ask: `Rank the branches by notional this month`,
    },
    {
      id: 'segments',
      title: 'Segments and channels',
      summary: `Digibank is ${pct(sum(rows.filter((r) => r.channel === 'digibank'), 'trades'), trades)}% of trades and ${pct(sum(rows.filter((r) => r.channel === 'digibank'), 'notionalMtdUsd'), notional)}% of notional in ${where}.`,
      table: {
        columns: ['Segment', 'Channel', 'Notional MTD', 'Trades'],
        numeric: [false, false, true, true],
        rows: [...new Set(rows.map((r) => `${r.segment}|${r.channel}`))].map((k) => {
          const [seg, ch] = k.split('|');
          const r = rows.filter((x) => x.segment === seg && x.channel === ch);
          return [seg, ch === 'digibank' ? 'Digibank' : 'Advisory', usdM(sum(r, 'notionalMtdUsd')), String(sum(r, 'trades'))];
        }),
      },
      source: 'EQD master',
      wholeBusinessOnly: coarse,
      ask: 'How does digibank compare with advisory this month?',
    },
    {
      id: 'underlyings',
      title: 'Top underlyings traded',
      summary: `${TOP_UNDERLYINGS[0].underlying} leads with ${usdM(TOP_UNDERLYINGS[0].notionalUsd)}. The top five are ${pct(TOP_UNDERLYINGS.reduce((s, u) => s + u.notionalUsd, 0), BUSINESS_ROWS.reduce((s, r) => s + r.notionalMtdUsd, 0))}% of notional.`,
      table: { columns: ['Underlying', 'Notional MTD', 'Trades'], numeric: [false, true, true], rows: TOP_UNDERLYINGS.map((u) => [u.underlying, usdM(u.notionalUsd), String(u.trades)]) },
      source: 'Blotter',
      wholeBusinessOnly: scope !== 'all',
      ask: 'Which underlyings traded most this month?',
    },
    {
      id: 'concentration',
      title: 'Concentration against limits',
      summary: `${BOOK_CONCENTRATION[0].underlying} is ${BOOK_CONCENTRATION[0].sharePct}% of the bank's ELI book against a ${BOOK_CONCENTRATION[0].limitPct}% name limit. Ideas on it are hidden by the limit rule until the desk overrides.`,
      table: {
        columns: ['Underlying', 'Share of book', 'Limit', 'Headroom'],
        numeric: [false, true, true, true],
        rows: BOOK_CONCENTRATION.map((c) => [c.underlying, `${c.sharePct}%`, `${c.limitPct}%`, `${(c.limitPct - c.sharePct).toFixed(2)} pts`]),
        flagged: BOOK_CONCENTRATION.map((c, i) => (c.sharePct >= c.limitPct * 0.85 ? i : -1)).filter((i) => i >= 0),
      },
      source: 'Outstanding stock, limit table',
      wholeBusinessOnly: scope !== 'all',
      ask: 'Top concentrations against limit',
    },
    {
      id: 'events',
      title: 'Knock-outs and deliveries ahead',
      summary: `In the next 10 business days: ${count('knockout')} likely ${count('knockout') === 1 ? 'knock-out' : 'knock-outs'} and ${count('exercised')} expected stock ${count('exercised') === 1 ? 'delivery' : 'deliveries'} in ${clientWhere} (sample clients).`,
      figures: [
        { label: 'Likely knock-outs', value: String(count('knockout')) },
        { label: 'Stock deliveries', value: String(count('exercised')) },
        { label: 'Maturities', value: String(count('maturity')) },
      ],
      source: 'Fixings, EQD master',
      wholeBusinessOnly: false,
      ask: 'Which knock-outs are close to the barrier?',
    },
    {
      id: 'idle',
      title: 'Idle clients',
      summary: `${idle} of ${active} ELI clients (${pct(idle, active)}%) have not traded for 90 days. Reactivation has no agreed baseline yet.`,
      figures: [
        { label: 'Idle 90+ days', value: String(idle), tone: 'warn' },
        { label: 'ELI clients', value: String(active) },
        { label: 'Idle share', value: `${pct(idle, active)}%` },
      ],
      source: 'Blotter, client master',
      wholeBusinessOnly: coarse,
      ask: `Who has been idle longest in ${where}?`,
    },
    {
      id: 'handoffs',
      title: 'Hand-offs and linked conversion',
      summary:
        conversion.pct === null
          ? 'No hand-off window has closed yet.'
          : `${conversion.linked} of ${conversion.decided} handed-off clients traded within 10 business days (${conversion.pct}%), against ${conversion.noHandoffPct}% for comparable clients with no hand-off. Linked, not caused.`,
      figures: [
        { label: 'Linked conversion', value: conversion.pct === null ? '–' : `${conversion.pct}%`, tone: 'up' },
        { label: 'No hand-off', value: `${conversion.noHandoffPct}%` },
        { label: 'Windows open', value: String(conversion.open) },
        { label: 'Desk declined', value: String(conversion.declined) },
      ],
      source: 'Hand-off records, blotter',
      wholeBusinessOnly: scope !== 'all',
      ask: 'Which hand-offs led to a trade?',
    },
    {
      id: 'mix',
      title: 'Tenor and knock-in mix',
      summary: `3M and 6M are ${TENOR_KI_MIX[0].sharePct + TENOR_KI_MIX[1].sharePct}% of trades. Shorter tenors carry closer knock-ins and higher coupons.`,
      table: {
        columns: ['Tenor', 'Share of trades', 'Average KI', 'Average coupon'],
        numeric: [false, true, true, true],
        rows: TENOR_KI_MIX.map((m) => [m.tenor, `${m.sharePct}%`, `${m.avgKiPct}%`, `${m.avgCouponPct}%`]),
      },
      source: 'Blotter, EQD master',
      wholeBusinessOnly: scope !== 'all',
      ask: 'What tenors and knock-ins are clients choosing?',
    },
  ];
  return { scope, scopeName: name, dataDate, sections };
}

/** The whole update as plain text, for pasting into an email or Teams, with the data date and label. */
export function updateAsText(u: BusinessUpdate): string {
  const out = [`HK ELI Business Update · ${u.scopeName} · data as of close ${u.dataDate}`, ''];
  u.sections.forEach((s, i) => {
    out.push(`${i + 1}. ${s.title}${s.wholeBusinessOnly ? ' (whole business)' : ''}`, s.summary);
    if (s.figures) out.push(s.figures.map((f) => `${f.label}: ${f.value}`).join(' · '));
    if (s.table) out.push(s.table.columns.join(' | '), ...s.table.rows.map((r) => r.join(' | ')));
    out.push('');
  });
  out.push('Figures computed from data. Internal use only.');
  return out.join('\n');
}
