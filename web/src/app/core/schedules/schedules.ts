/**
 * Scheduled reports (R16, R33), as a working design preview (MVP1 design, MVP2 build): one form with a live
 * summary, snap times, templates, several recipients, email, Teams and in-app delivery, test send, run history,
 * pause and resume. Recipients are picked from the authorised internal list only (R39: nothing goes to clients).
 */
import { BookScope, scopeLabel } from '../models/scope';
import { addBusinessDays, isBusinessDay, shortDate } from '../time/business-calendar';

export type ReportTemplate = 'business-update' | 'pockets' | 'handoff-conversion' | 'digibank-funnel';
export type Frequency = 'daily' | 'weekly' | 'monthly';
export type Channel = 'email' | 'teams' | 'in-app';

export const TEMPLATES: readonly { id: ReportTemplate; label: string; detail: string }[] = [
  { id: 'business-update', label: 'Business Update', detail: 'All 15 sections, as on the Update tab' },
  { id: 'pockets', label: 'Pockets below the rollover line', detail: 'Pockets under 80% with their maturing notional' },
  { id: 'handoff-conversion', label: 'Hand-off lists and linked conversion', detail: 'Lists handed out, windows open and linked trades' },
  { id: 'digibank-funnel', label: 'Digibank quote funnel', detail: 'Quotes to trades, and where people drop off' },
];

/** Snap times. 09:30 is the first time this morning's prices are reliably in. */
export const SNAP_TIMES = ['08:30', '09:30', '12:30', '17:30'] as const;
export const PRICES_IN_BY = '09:30';

export const CHANNEL_LABELS: Record<Channel, string> = { email: 'email', teams: 'Teams', 'in-app': 'in-app' };

/** The authorised internal recipients (demo names). The real list comes from the entitlement service. */
export const RECIPIENT_DIRECTORY: readonly { id: string; name: string; role: string }[] = [
  { id: 'u-kelly', name: 'Kelly Lau', role: 'GFM WMS' },
  { id: 'u-ming', name: 'Ming Chan', role: 'GFM WMS' },
  { id: 'u-alex', name: 'Alex Wong', role: 'CBG PM' },
  { id: 'u-grace', name: 'Grace Ho', role: 'CBG TSM' },
  { id: 'u-tsm-team', name: 'CBG TSM team', role: 'Teams channel' },
  { id: 'u-gfm-desk', name: 'GFM WMS desk', role: 'Teams channel' },
];

export interface ScheduleDraft {
  readonly template: ReportTemplate;
  readonly scope: BookScope;
  readonly frequency: Frequency;
  /** 1 = Monday ... 5 = Friday, for weekly. */
  readonly weekday: number;
  readonly time: string;
  readonly recipients: readonly string[];
  readonly channels: readonly Channel[];
}

export type RunStatus = 'sent' | 'held' | 'failed';

export interface ScheduleRun {
  readonly at: string;
  readonly status: RunStatus;
  readonly note: string;
}

export interface Schedule extends ScheduleDraft {
  readonly id: string;
  readonly paused: boolean;
  readonly runs: readonly ScheduleRun[];
}

const WEEKDAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export function templateLabel(t: ReportTemplate): string {
  return TEMPLATES.find((x) => x.id === t)?.label ?? t;
}

function list(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function when(d: ScheduleDraft): string {
  switch (d.frequency) {
    case 'daily':
      return `Every business day at ${d.time} HKT`;
    case 'weekly':
      return `Every ${WEEKDAYS[d.weekday]} at ${d.time} HKT`;
    case 'monthly':
      return `On the first business day of each month at ${d.time} HKT`;
  }
}

/** What is wrong with the draft, in plain words; empty when it can be saved. */
export function problems(d: ScheduleDraft): string[] {
  const out: string[] = [];
  if (d.recipients.length === 0) {
    out.push('Pick at least one recipient.');
  }
  if (d.channels.length === 0) {
    out.push('Pick at least one way to deliver it.');
  }
  return out;
}

/** The live summary sentence under the form. */
export function describe(d: ScheduleDraft): string {
  const scope = d.scope === 'all' ? 'the whole business' : scopeLabel(d.scope);
  const who = d.recipients.map((id) => RECIPIENT_DIRECTORY.find((r) => r.id === id)?.name ?? id);
  const recipients = who.length ? list(who) : 'nobody yet';
  const channels = d.channels.length ? list(d.channels.map((c) => CHANNEL_LABELS[c])) : 'no channel yet';
  return `${when(d)}, ${templateLabel(d.template)} for ${scope} goes to ${recipients} by ${channels}.`;
}

/** A caution shown under the summary, when the time or template has a known catch. */
export function caution(d: ScheduleDraft): string | null {
  if (d.time < PRICES_IN_BY && (d.template === 'pockets' || d.template === 'business-update')) {
    return `This runs before ${PRICES_IN_BY}, when this morning's prices may not be in. It uses last night's data and says so.`;
  }
  return null;
}

/** The next run date (ISO) on or after `today`, skipping weekends and holidays. */
export function nextRun(d: ScheduleDraft, today: string, nowHkt: string, holidays: readonly string[]): string {
  const startsToday = isBusinessDay(today, holidays) && nowHkt < d.time;
  let day = startsToday ? today : addBusinessDays(today, 1, holidays);
  if (d.frequency === 'weekly') {
    while (new Date(`${day}T00:00:00Z`).getUTCDay() !== d.weekday) {
      day = addBusinessDays(day, 1, holidays);
    }
  } else if (d.frequency === 'monthly') {
    while (!isFirstBusinessDayOfMonth(day, holidays)) {
      day = addBusinessDays(day, 1, holidays);
    }
  }
  return day;
}

function isFirstBusinessDayOfMonth(iso: string, holidays: readonly string[]): boolean {
  let d = `${iso.slice(0, 8)}01`;
  while (!isBusinessDay(d, holidays)) {
    d = addBusinessDays(d, 1, holidays);
  }
  return d === iso;
}

export function nextRunLabel(iso: string, time: string): string {
  return `${shortDate(iso)}, ${time} HKT`;
}

/** Plain text for a test send, with the internal-use label (R39). */
export function testSendText(d: ScheduleDraft): string {
  return `[TEST] ${templateLabel(d.template)} · ${d.scope === 'all' ? 'Whole business' : scopeLabel(d.scope)}\n${describe(d)}\nInternal use only. Not for clients.`;
}
