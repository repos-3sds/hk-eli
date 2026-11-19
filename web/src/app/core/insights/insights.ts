import { ChartCategory, ChartSpec, ChatAnswer } from '../chat/chat.models';
import { hkd } from '../../features/chat/answer-chart';

/**
 * Today's insights, worked out by code from the rows of the HK_ELI Tableau views (via the pipeline's chart data):
 * a concentration, a peak day, a branch hotspot and the predicted KO mix. Each one carries its figure, why it
 * matters and the view it came from. Nothing here is written by the model, and nothing is a canned prompt.
 */
export interface Insight {
  readonly id: string;
  readonly kind: 'Concentration' | 'Peak day' | 'Hotspot' | 'Predicted outcome';
  readonly level: 'watch' | 'info';
  readonly title: string;
  readonly figure: string;
  readonly detail: string;
  /** 0–100, drawn as a bar: the share the title talks about. */
  readonly sharePct: number;
  readonly source: string;
  readonly tableauUrl?: string;
  /** A question that goes deeper in Chat. */
  readonly askMore: string;
}

function chart(a: ChatAnswer | undefined): ChartSpec | null {
  const b = a?.blocks.find((x) => x.kind === 'chart');
  return b?.kind === 'chart' ? b.spec : null;
}

function cats(a: ChatAnswer | undefined): readonly ChartCategory[] {
  const c = chart(a);
  return c && (c.kind === 'hbar' || c.kind === 'columns') ? c.categories : [];
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const part = (c: ChartCategory, r: string) => c.parts.find((p) => p.result === r)?.value ?? 0;

export function bookTotal(outstanding: ChatAnswer | undefined): number | null {
  const c = chart(outstanding);
  return c?.kind === 'kpi' ? c.value : null;
}

export function concentration(wps: ChatAnswer | undefined, book: number | null): Insight | null {
  const list = cats(wps);
  if (!list.length || !book) return null;
  const [top, next] = list;
  const share = top.total / book;
  return {
    id: 'concentration',
    kind: 'Concentration',
    level: share >= 0.15 ? 'watch' : 'info',
    title: `${top.key} is ${pct(share)} of the ELI book`,
    figure: hkd(top.total),
    detail: `The largest single-stock exposure${next ? `, ahead of ${next.key} at ${hkd(next.total)}` : ''}.${share >= 0.15 ? ' Above 15% of the book.' : ''}`,
    sharePct: 100 * share,
    source: wps!.sources[0] ?? '',
    tableauUrl: wps!.tableauUrl,
    askMore: `Show the MTM distribution for ${top.key}`,
  };
}

export function peakDay(calendar: ChatAnswer | undefined): Insight | null {
  const list = cats(calendar);
  if (list.length < 2) return null;
  const total = list.reduce((s, c) => s + c.total, 0);
  const peak = list.reduce((a, b) => (b.total > a.total ? b : a));
  const avg = total / list.length;
  return {
    id: 'peak',
    kind: 'Peak day',
    level: peak.total >= 2 * avg ? 'watch' : 'info',
    title: `${peak.label} is the biggest predicted maturity day`,
    figure: hkd(peak.total),
    detail: `${(peak.total / avg).toFixed(1)}× the daily average across ${list.length} days with maturities in the next 30 days (TRE).`,
    sharePct: (100 * peak.total) / total,
    source: calendar!.sources[0] ?? '',
    tableauUrl: calendar!.tableauUrl,
    askMore: `Which TRE clients are predicted to mature on ${peak.label}?`,
  };
}

export function hotspot(branches: ChatAnswer | undefined): Insight | null {
  const list = cats(branches);
  if (!list.length) return null;
  const total = list.reduce((s, c) => s + c.total, 0);
  const top = list[0];
  const ko = part(top, 'KO') / (top.total || 1);
  return {
    id: 'hotspot',
    kind: 'Hotspot',
    level: 'info',
    title: `${top.label.split(' · ')[0]} leads the next 30 days`,
    figure: hkd(top.total),
    detail: `${pct(top.total / total)} of TRE predicted maturities; ${pct(ko)} of it is predicted to knock out.`,
    sharePct: (100 * top.total) / total,
    source: branches!.sources[0] ?? '',
    tableauUrl: branches!.tableauUrl,
    askMore: `Show the clients behind ${top.label.split(' · ')[0]} maturing in the next 30 days`,
  };
}

export function outcomeMix(calendar: ChatAnswer | undefined): Insight | null {
  const list = cats(calendar);
  if (!list.length) return null;
  const total = list.reduce((s, c) => s + c.total, 0);
  const ko = list.reduce((s, c) => s + part(c, 'KO'), 0);
  const below = list.reduce((s, c) => s + part(c, 'EXP(Below Strike)'), 0);
  return {
    id: 'mix',
    kind: 'Predicted outcome',
    level: below > 0 ? 'watch' : 'info',
    title: `${pct(ko / total)} of the next 30 days is predicted to knock out`,
    figure: hkd(ko),
    detail: below > 0 ? `${hkd(below)} is predicted to expire below strike: clients who may receive shares.` : 'Nothing is predicted to expire below strike.',
    sharePct: (100 * ko) / total,
    source: calendar!.sources[0] ?? '',
    tableauUrl: calendar!.tableauUrl,
    askMore: 'Which TRE clients are predicted to expire below strike in the next 30 days?',
  };
}
