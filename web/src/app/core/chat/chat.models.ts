
/**
 * The Chat tab's data contract. An answer is a list of typed blocks, so figures are shown
 * as rendered data (tables, bars) and only the words around them come from the model.
 */
export interface ChatQuestion {
  readonly text: string;
  /** The server-side conversation this question continues, when the source stores conversations. */
  readonly conversationId?: string | null;
  /** Asked by the screen itself (Today's insights), not typed by the user: kept out of their chat history. */
  readonly background?: boolean;
}

export interface TextBlock {
  readonly kind: 'text';
  readonly text: string;
}

export interface BulletsBlock {
  readonly kind: 'bullets';
  readonly title: string;
  readonly items: readonly string[];
}

/** A breakdown table, so answers line up with the Tableau views the launch users know (R36). */
export interface TableBlock {
  readonly kind: 'table';
  readonly title: string;
  readonly columns: readonly string[];
  /** Columns holding numbers, right-aligned. */
  readonly numeric: readonly number[];
  readonly rows: readonly (readonly string[])[];
  /** Row indexes to flag, e.g. pockets below baseline. */
  readonly flagged?: readonly number[];
}

/** Predicted results, in the order the charts stack them. "All" is a bar with no split. */
export type PredictResult = 'KO' | 'EXP' | 'EXP(Below Strike)' | 'EX' | 'All';

export interface ChartCategory {
  readonly key: string;
  readonly label: string;
  readonly parts: readonly { readonly result: PredictResult; readonly value: number }[];
  readonly total: number;
  readonly note?: string;
}

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly result: PredictResult;
  readonly label: string;
}

/** The chart the pipeline builds from the same Tableau view rows as the numbers. We draw it in our own style. */
export type ChartSpec =
  | { readonly kind: 'kpi'; readonly title?: string; readonly value: number; readonly label: string }
  | { readonly kind: 'hbar'; readonly title?: string; readonly categories: readonly ChartCategory[]; readonly stacked?: boolean; readonly highlight?: readonly string[]; readonly unit?: 'hkd' | 'customers'; readonly more?: number }
  | { readonly kind: 'columns'; readonly title?: string; readonly categories: readonly ChartCategory[] }
  | { readonly kind: 'bubble'; readonly title?: string; readonly points: readonly ChartPoint[]; readonly highlight?: readonly string[] };

export interface ChartBlock {
  readonly kind: 'chart';
  readonly spec: ChartSpec;
}

/** Caveats the validation step attached: predicted figures, workarounds, scope limits. */
export interface NoticesBlock {
  readonly kind: 'notices';
  readonly items: readonly { readonly level: 'info' | 'warn' | 'error'; readonly label: string; readonly text: string }[];
}

/** How the answer was made: which Tableau view, which filters, how many rows, and each pipeline step. Always shown open. */
export interface EvidenceBlock {
  readonly kind: 'evidence';
  readonly views: readonly { readonly view: string; readonly request: string; readonly rows: number; readonly proven: readonly string[] }[];
  readonly steps: readonly { readonly n: number; readonly name: string; readonly detail: string; readonly ms: number }[];
  readonly assumptions: readonly string[];
}

export type AnswerBlock =
  | TextBlock
  | BulletsBlock
  | TableBlock
  | ChartBlock
  | NoticesBlock
  | EvidenceBlock;

export interface ChatAnswer {
  readonly id: string;
  readonly blocks: readonly AnswerBlock[];
  readonly followUps: readonly string[];
  readonly businessDate: string;
  readonly sources: readonly string[];
  /** True when the question was not understood and the answer only suggests what to ask. */
  readonly fallback: boolean;
  /** Pipeline answers: the population the figures cover, e.g. "TRE · predicted maturity next 30 days". */
  readonly scope?: string;
  /** Pipeline answers: when the Tableau data was refreshed (ISO), next to the business date. */
  readonly refreshedAt?: string;
  /** Pipeline answers: the same Tableau view with the same filters, one click away. */
  readonly tableauUrl?: string;
  /** The Tableau view behind the answer, with the same filters, for the split view beside the chat. */
  readonly embed?: {
    readonly view: string;
    readonly url: string;
    readonly src?: string;
    readonly mode?: string;
    readonly filtersByCaption?: Readonly<Record<string, readonly string[]>>;
    readonly highlight?: readonly string[];
    readonly highlightCaption?: string;
  };
  /** Pipeline answers: whether Gemini or the rules read the question and wrote the words. */
  readonly writtenBy?: string;
  /** Stored answers: ids in the server's SQLite store, for feedback and history. */
  readonly turnId?: string;
  readonly conversationId?: string;
  /** Pipeline answers: the server's own time to answer. */
  readonly latencyMs?: number;
  /** Pipeline answers: the outcome (OK, NEEDS_CLARIFICATION, UNSUPPORTED…) and the intent it was read as. */
  readonly status?: string;
  readonly intent?: string;
  /** Pipeline answers: every figure the code computed, with the view it was read from. Shown as verified chips. */
  readonly figures?: readonly { readonly display: string; readonly measure: string; readonly source: string }[];
  readonly model?: string;
}
