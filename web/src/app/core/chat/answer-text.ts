import { ChatAnswer } from './chat.models';

/** An answer as plain text, for Copy: the words and the figures, with the sources at the end. */
export function answerAsText(answer: ChatAnswer): string {
  const lines: string[] = [];
  for (const b of answer.blocks) {
    switch (b.kind) {
      case 'text':
        lines.push(b.text);
        break;
      case 'facts':
        lines.push(b.items.map((f) => `${f.label}: ${f.value}`).join(' · '));
        break;
      case 'clients':
        lines.push(b.title, ...b.rows.map((r) => `- ${r.name}, ${r.when}: ${r.note}`));
        break;
      case 'concentration':
        lines.push(b.title, ...b.lines.map((l) => `- ${l.underlying} ${l.sharePct.toFixed(1)}% (limit ${l.limitPct}%)`));
        break;
      case 'ideas':
        lines.push(b.title, ...b.ideas.map((i, n) => `${n + 1}. ${i.title}: ${i.tenor}, coupon ${i.couponPct}%, KI ${i.kiPct}% (${i.concentration})`));
        break;
      case 'bullets':
        lines.push(b.title, ...b.items.map((i) => `- ${i}`));
        break;
    }
  }
  lines.push(`Sources: ${answer.sources.join(', ')}. Business date ${answer.businessDate}. Figures computed from data, wording by AI.`);
  return lines.join('\n');
}
