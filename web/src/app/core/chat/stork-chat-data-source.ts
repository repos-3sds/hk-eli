import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, timeout } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { ChatDataSource } from './chat-data-source';
import { AnswerBlock, ChartSpec, ChatAnswer, ChatQuestion } from './chat.models';

/** What the Python Stork pipeline returns from POST /api/ask (poc/hkeli_poc/stork/pipeline.py). */
export interface StorkAnswer {
  readonly question: string;
  readonly status: string;
  readonly headline: string;
  readonly bullets?: readonly string[];
  readonly caveats?: readonly { readonly code: string; readonly level: 'info' | 'warn' | 'error'; readonly text: string }[];
  readonly table?: { readonly columns: readonly string[]; readonly rows: readonly (readonly string[])[]; readonly more?: number } | null;
  readonly chart?: ChartSpec | null;
  readonly evidence?: readonly {
    readonly view: string;
    readonly request: string;
    readonly row_count: number;
    readonly asserted?: readonly string[];
  }[];
  readonly embed?: { readonly url: string; readonly src?: string } | null;
  readonly followups?: readonly string[];
  readonly as_of?: { readonly business_date: string | null; readonly last_refresh: string | null; readonly known: boolean } | null;
  readonly scope?: string | null;
  readonly trace?: readonly { readonly n: number; readonly name: string; readonly detail: unknown; readonly ms: number }[];
  readonly assumptions?: readonly string[];
}

/** Statuses where the pipeline could not answer from data and only says what it can answer. */
const NOT_ANSWERED = new Set(['UNSUPPORTED', 'NEEDS_CLARIFICATION', 'SYSTEM_ERROR', 'VALIDATION_FAILED']);

/** Short labels for the validation caveats, in the user's words. */
const CAVEAT_LABELS: Record<string, string> = {
  PREDICTIVE: 'Predicted',
  STALE_DATA: 'Stale data',
  AS_OF_UNKNOWN: 'Data date',
  DATE_LIST_WORKAROUND: 'Workaround',
  WINDOW_NOT_SUPPORTED: 'Window',
  POPULATION_UNDECLARED: 'Population',
  HIDDEN_RULE: 'Hidden rule',
  CONTROL_TOTAL_MISMATCH: "Totals don't reconcile",
  CONTROL_TOTAL_OK: 'Totals reconcile',
  TABLE_CALC_NOT_EXPORTED: 'Calc not exported',
  SCOPE_MISMATCH: 'Chart scope',
  MEASURE_NOT_PUBLISHED: 'No customer count',
  TRE_ONLY: 'Treasures only',
};

const NUMERIC = /^(HKD |-)?[\d,.]+(m|bn|k|%)?$/;

/** Turns a pipeline answer into our typed answer blocks. Every figure is the pipeline's; nothing is recomputed here. */
export function toChatAnswer(a: StorkAnswer, id: string): ChatAnswer {
  const blocks: AnswerBlock[] = [{ kind: 'text', text: a.headline }];
  if (a.chart) {
    blocks.push({ kind: 'chart', spec: a.chart });
  }
  if (a.bullets?.length) {
    blocks.push({ kind: 'bullets', title: 'Also', items: a.bullets });
  }
  if (a.table?.rows.length) {
    const first = a.table.rows[0];
    blocks.push({
      kind: 'table',
      title: a.table.more ? `The numbers (first ${a.table.rows.length}, ${a.table.more} more in the view)` : 'The numbers',
      columns: a.table.columns,
      numeric: a.table.columns.map((_, i) => i).filter((i) => NUMERIC.test(String(first[i] ?? ''))),
      rows: a.table.rows,
    });
  }
  const notices = (a.caveats ?? []).filter((c) => c.text !== a.headline);
  if (notices.length) {
    blocks.push({ kind: 'notices', items: notices.map((c) => ({ level: c.level, label: CAVEAT_LABELS[c.code] ?? c.code, text: c.text })) });
  }
  if (a.evidence?.length || a.trace?.length) {
    blocks.push({
      kind: 'evidence',
      views: (a.evidence ?? []).map((e) => ({ view: e.view, request: safeDecode(e.request), rows: e.row_count, proven: e.asserted ?? [] })),
      steps: (a.trace ?? []).map((s) => ({ n: s.n, name: s.name, detail: JSON.stringify(s.detail), ms: s.ms })),
      assumptions: a.assumptions ?? [],
    });
  }
  return {
    id,
    blocks,
    followUps: a.followups ?? [],
    businessDate: a.as_of?.business_date ?? '',
    refreshedAt: a.as_of?.last_refresh ?? undefined,
    sources: [...new Set((a.evidence ?? []).map((e) => e.view))],
    fallback: NOT_ANSWERED.has(a.status),
    scope: a.scope ?? undefined,
    tableauUrl: a.embed ? (a.embed.src ?? a.embed.url) : undefined,
  };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** The Python Stork pipeline: understand, route to one of the 12 HK_ELI views, filter, query, validate, write. */
@Injectable({ providedIn: 'root' })
export class StorkClient {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);
  private counter = 0;

  ask(question: string): Observable<ChatAnswer> {
    return this.http
      .post<StorkAnswer>(`${this.config.gatewayBaseUrl}/ask`, { question, site: 'proposed' })
      .pipe(
        timeout(this.config.requestTimeoutMs),
        map((a) => toChatAnswer(a, `s-${++this.counter}`)),
      );
  }
}

@Injectable()
export class StorkChatDataSource extends ChatDataSource {
  private readonly client = inject(StorkClient);

  ask(question: ChatQuestion): Observable<ChatAnswer> {
    return this.client.ask(question.text);
  }
}
