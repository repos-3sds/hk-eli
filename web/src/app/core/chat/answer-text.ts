import { ChatAnswer } from './chat.models';

/** An answer as plain text, for Copy: the words and the figures, with the sources at the end. */
export function answerAsText(answer: ChatAnswer): string {
  const lines: string[] = [];
  for (const b of answer.blocks) {
    switch (b.kind) {
      case 'text':
        lines.push(b.text);
        break;
      case 'bullets':
        lines.push(b.title, ...b.items.map((i) => `- ${i}`));
        break;
      case 'table':
        lines.push(b.title, b.columns.join(' | '), ...b.rows.map((r) => r.join(' | ')));
        break;
      case 'notices':
        lines.push(...b.items.map((i) => `${i.label}: ${i.text}`));
        break;
      case 'chart':
      case 'evidence':
        break;
    }
  }
  lines.push(`Sources: ${answer.sources.join(', ')}. Data as of close ${answer.businessDate}. Figures computed from data, wording by AI. Internal use only.`);
  return lines.join('\n');
}
