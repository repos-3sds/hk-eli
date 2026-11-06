import { addDays } from '../time/business-calendar';
import type { FeedbackEntry } from './feedback.store';

/** Demo ratings from the launch users, by day of the week (0 = Monday). Invented, labelled as samples on screen. */
const SAMPLES: readonly (Omit<FeedbackEntry, 'id' | 'at' | 'sample'> & { day: number; time: string })[] = [
  { day: 0, time: '09:12', topic: "Today's list", rating: 'up', note: '', role: 'wms' },
  { day: 0, time: '09:40', topic: 'Chat answer: Who matures this week?', rating: 'up', note: '', role: 'wms' },
  { day: 0, time: '10:05', topic: 'Shelf console', rating: 'up', note: 'Demand next to concentration saves me a Tableau tab.', role: 'pm' },
  { day: 0, time: '17:30', topic: 'Business Update', rating: 'down', note: 'Branch table should match the monthly Tableau pack order.', role: 'tsm' },
  { day: 1, time: '08:55', topic: 'Ideas results', rating: 'up', note: '', role: 'wms' },
  { day: 1, time: '09:20', topic: 'Chat answer: Rollover by branch this month', rating: 'down', note: 'Figure differs from my Tableau view by one trade.', role: 'tsm' },
  { day: 1, time: '11:10', topic: 'Hand-off list', rating: 'up', note: '', role: 'wms' },
  { day: 2, time: '09:05', topic: "Today's list", rating: 'up', note: '', role: 'tsm' },
  { day: 2, time: '14:45', topic: 'Alerts preview', rating: 'down', note: 'Quiet hours should default to after 18:00.', role: 'pm' },
  { day: 3, time: '09:30', topic: 'Ideas results', rating: 'down', note: 'Prices were late; the label helped but I needed them by 09:15.', role: 'wms' },
];

/** Sample entries for the days of this week before today. */
export function FEEDBACK_EARLIER_THIS_WEEK(today: string): FeedbackEntry[] {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = addDays(today, dow === 0 ? -6 : 1 - dow);
  return SAMPLES.map((s) => ({ ...s, date: addDays(monday, s.day) }))
    .filter((s) => s.date < today)
    .map(({ day: _day, time, date, ...rest }, i) => ({ ...rest, id: `fb-sample-${i}`, at: `${date}T${time}:00+08:00`, sample: true }));
}
