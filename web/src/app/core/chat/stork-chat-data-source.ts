import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, timeout } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { ChatDataSource, StoredTurn } from './chat-data-source';
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
  readonly embed?: {
    readonly view?: string;
    readonly url: string;
    readonly src?: string;
    readonly mode?: string;
    readonly filters_by_caption?: Record<string, string[]>;
    readonly highlight?: string[];
    readonly highlight_caption?: string;
  } | null;
  readonly followups?: readonly string[];
  readonly as_of?: { readonly business_date: string | null; readonly last_refresh: string | null; readonly known: boolean } | null;
  readonly scope?: string | null;
  readonly trace?: readonly { readonly n: number; readonly name: string; readonly detail: unknown; readonly ms: number }[];
  readonly assumptions?: readonly string[];
  readonly numbers?: readonly { readonly display: string; readonly measure: string; readonly source: string }[];
  readonly turn_id?: string;
  readonly conversation_id?: string;
  readonly latency_ms?: number;
  readonly meta?: { readonly understanding?: string; readonly insight?: string; readonly model?: string | null; readonly provider?: string };
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
    embed: a.embed
      ? {
          view: a.embed.view ?? a.evidence?.[0]?.view ?? 'Tableau view',
          url: a.embed.url,
          src: a.embed.src,
          mode: a.embed.mode,
          filtersByCaption: a.embed.filters_by_caption,
          highlight: a.embed.highlight,
          highlightCaption: a.embed.highlight_caption,
        }
      : undefined,
    writtenBy: writtenBy(a.meta),
    turnId: a.turn_id,
    conversationId: a.conversation_id,
    latencyMs: a.latency_ms ?? Math.round((a.trace ?? []).reduce((s, x) => s + x.ms, 0)),
    status: a.status,
    intent: intentOf(a),
    figures: (a.numbers ?? []).map((n) => ({ display: n.display, measure: n.measure, source: n.source })),
    model: a.meta?.model && a.meta.model !== 'off' ? a.meta.model : undefined,
  };
}

/** Who read the question and who wrote the words, so users can see when Gemini answered and when rules did. */
function writtenBy(meta: StorkAnswer['meta']): string | undefined {
  if (!meta) return undefined;
  const model = meta.model && meta.model !== 'off' ? meta.model : null;
  // The pipeline names the setting ("gateway"); users want to know it was Gemini.
  const who = (s: string | undefined, fallback: string) => {
    const v = (s ?? fallback).trim();
    return /^(gateway|gemini|model)\b/i.test(v) ? (meta.provider ?? 'Gemini') : v === 'template' ? 'template (no model)' : v;
  };
  return `Question read by ${who(meta.understanding, 'rules')} · words by ${who(meta.insight, 'template')}${model ? ` · ${model}` : ''}`;
}

function intentOf(a: StorkAnswer): string | undefined {
  const step = (a.trace ?? []).find((s) => s.name === 'Understand');
  const d = step?.detail as { intent?: string } | undefined;
  return d?.intent && d.intent !== 'unknown' ? d.intent : undefined;
}

const BACKGROUND_KEY = 'eli.insightConversations';

function readIds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(BACKGROUND_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  try {
    localStorage.setItem(BACKGROUND_KEY, JSON.stringify(ids.slice(0, 50)));
  } catch {
    /* private window: history may show insight questions; harmless */
  }
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

  /**
   * Today's insight questions go to the same /ask route and the server saves every turn.
   * We keep them in their own conversations and leave those out of the user's history.
   * (channel: 'insights' tells a server that understands it not to record them at all.)
   */
  private readonly backgroundIds = new Set<string>(readIds());

  ask(question: string, conversationId?: string | null, background = false): Observable<ChatAnswer> {
    const body: Record<string, unknown> = { question, site: 'proposed' };
    const conv = background ? ([...this.backgroundIds][0] ?? null) : conversationId;
    if (conv) body['conversation_id'] = conv;
    if (background) body['channel'] = 'insights';
    return this.http
      .post<StorkAnswer>(`${this.config.gatewayBaseUrl}/ask`, body)
      .pipe(
        timeout(this.config.requestTimeoutMs),
        map((a) => {
          if (background && a.conversation_id && !this.backgroundIds.has(a.conversation_id)) {
            this.backgroundIds.add(a.conversation_id);
            writeIds([...this.backgroundIds]);
          }
          return toChatAnswer(a, `s-${++this.counter}`);
        }),
      );
  }

  /** GET /api/v1/history: this user's stored questions (SQLite). Null when the server has no store. */
  history(): Observable<readonly StoredTurn[] | null> {
    return this.http
      .get<{ turns: { id: string; conversation_id: string; created_at: string; question: string; status: string; headline: string }[] }>(
        `${this.config.gatewayBaseUrl}/v1/history`,
        { params: { limit: 200 } },
      )
      .pipe(
        map((r) => r.turns.filter((t) => !this.backgroundIds.has(t.conversation_id)).map((t) => ({ turnId: t.id, conversationId: t.conversation_id, askedAt: t.created_at, question: t.question, status: t.status, headline: t.headline }))),
        catchError(() => of(null)),
      );
  }

  feedback(turnId: string, rating: 1 | -1): Observable<unknown> {
    return this.http.post(`${this.config.gatewayBaseUrl}/v1/feedback`, { turn_id: turnId, rating }).pipe(catchError(() => of(null)));
  }
}

@Injectable()
export class StorkChatDataSource extends ChatDataSource {
  private readonly client = inject(StorkClient);

  ask(question: ChatQuestion): Observable<ChatAnswer> {
    return this.client.ask(question.text, question.conversationId, question.background ?? false);
  }

  override storedHistory(): Observable<readonly StoredTurn[] | null> {
    return this.client.history();
  }

  override sendFeedback(turnId: string, rating: 1 | -1): Observable<unknown> {
    return this.client.feedback(turnId, rating);
  }
}
