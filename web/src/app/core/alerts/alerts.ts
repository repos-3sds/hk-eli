/**
 * Alerts and schedules, as a working design preview (MVP1 design, MVP2 build). Rules are written in plain words:
 * "fire when 2 of these 4 are true". Conditions are checked against the demo data here; MVP2 runs them on real data.
 */
import { LaunchRole } from '../session/session.service';

export interface AlertCondition {
  readonly id: string;
  /** Plain words, e.g. "Rollover in the pocket is below 80%". */
  readonly text: string;
  /** Whether it is true on today's data, and the figure that says so. */
  readonly met: boolean;
  readonly evidence: string;
}

export interface AlertRule {
  readonly id: string;
  readonly name: string;
  readonly forRole: LaunchRole;
  readonly conditions: readonly AlertCondition[];
  /** Fire when at least this many conditions are true. */
  readonly needed: number;
  readonly on: boolean;
  readonly delivery: 'instant' | 'digest';
  /** Clients the alert is about, for "Make hand-off list". */
  readonly clients: readonly { readonly clientId: string; readonly clientName: string; readonly ownerRm: string; readonly branch: string }[];
  /** Where "Open" goes. */
  readonly openLink: { readonly path: string; readonly query: Readonly<Record<string, string>> };
}

export interface QuietHours {
  readonly from: string;
  readonly to: string;
}

export function metCount(rule: AlertRule): number {
  return rule.conditions.filter((c) => c.met).length;
}

export function fires(rule: AlertRule): boolean {
  return rule.on && metCount(rule) >= rule.needed;
}

/** "08:30" inside a quiet window that may run past midnight, e.g. 19:00 to 08:00. */
export function inQuietHours(hhmm: string, q: QuietHours): boolean {
  const t = toMin(hhmm);
  const f = toMin(q.from);
  const e = toMin(q.to);
  return f <= e ? t >= f && t < e : t >= f || t < e;
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export const DEMO_RULES: readonly AlertRule[] = [
  {
    id: 'r-pocket',
    name: 'A rollover pocket is slipping',
    forRole: 'tsm',
    conditions: [
      { id: 'c1', text: 'Rollover in the pocket is below 80% this month', met: true, evidence: 'Kwun Tong · Treasures at 45%' },
      { id: 'c2', text: 'More than USD 1m matures there in the next 10 business days', met: true, evidence: 'USD 3.8m' },
      { id: 'c3', text: 'Rollover fell more than 10 points on last month', met: true, evidence: '45% against 62% in October' },
      { id: 'c4', text: 'No hand-off went to the branch this week', met: false, evidence: 'Last hand-off 21 Oct, still in its window' },
    ],
    needed: 3,
    on: true,
    delivery: 'instant',
    clients: [
      { clientId: 'c-4821', clientName: 'Chan Tai Man', ownerRm: 'Srivalli T.', branch: 'Kwun Tong' },
      { clientId: 'c-7720', clientName: 'Lee Mei', ownerRm: 'Srivalli T.', branch: 'Kwun Tong' },
      { clientId: 'c-1177', clientName: 'Fung Ray', ownerRm: 'Srivalli T.', branch: 'Kwun Tong' },
    ],
    openLink: { path: '/today', query: {} },
  },
  {
    id: 'r-limit',
    name: 'A busy name is near its limit',
    forRole: 'pm',
    conditions: [
      { id: 'c1', text: 'The name is at 85% of its book limit or more', met: true, evidence: 'NVDA at 24.63% of 25%' },
      { id: 'c2', text: 'Digibank quotes on it rose week on week', met: true, evidence: '214 quotes, up from 160' },
      { id: 'c3', text: 'It is on tomorrow’s shelf', met: false, evidence: 'Not picked' },
      { id: 'c4', text: 'Quote to trade on it is under 20%', met: true, evidence: '14%' },
    ],
    needed: 2,
    on: true,
    delivery: 'instant',
    clients: [],
    openLink: { path: '/shelf', query: {} },
  },
  {
    id: 'r-knockout',
    name: 'Knock-outs bunch up on one name',
    forRole: 'wms',
    conditions: [
      { id: 'c1', text: 'Two or more likely knock-outs on the same name within 5 business days', met: false, evidence: 'TSLA: 2, but 6 days apart' },
      { id: 'c2', text: 'The clients also have a maturity this month', met: true, evidence: 'Wong Ka Lok, Tsang Jun' },
      { id: 'c3', text: 'A rollover idea on that name pays more than last week', met: true, evidence: 'TSLA 3M coupon +1.2 points' },
      { id: 'c4', text: 'The name is under 85% of its limit', met: true, evidence: 'TSLA at 17.9% of 25%' },
    ],
    needed: 2,
    on: true,
    delivery: 'digest',
    clients: [
      { clientId: 'c-1093', clientName: 'Wong Ka Lok', ownerRm: 'Jason Yu', branch: 'Central' },
      { clientId: 'c-8890', clientName: 'Tsang Jun', ownerRm: 'Peter Leung', branch: 'Tsim Sha Tsui' },
    ],
    openLink: { path: '/today', query: {} },
  },
  {
    id: 'r-idle',
    name: 'Idle clients pile up in a branch',
    forRole: 'tsm',
    conditions: [
      { id: 'c1', text: 'More than 30% of the branch’s ELI clients are idle 90+ days', met: true, evidence: 'Kwun Tong 36%' },
      { id: 'c2', text: 'The share rose on last month', met: false, evidence: 'Flat at 36%' },
      { id: 'c3', text: 'A reactivation idea lines up 4 or more signals', met: false, evidence: 'Best is 3 of 6' },
    ],
    needed: 2,
    on: false,
    delivery: 'digest',
    clients: [{ clientId: 'c-3310', clientName: 'Ho Siu Fung', ownerRm: 'Mandy Chow', branch: 'Mong Kok' }],
    openLink: { path: '/update', query: { scope: 'branch:Kwun Tong' } },
  },
];
