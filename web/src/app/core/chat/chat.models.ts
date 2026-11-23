
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

/** One Tableau view of the answer's topic, with the same filter spec compiled for it (poc plan.bundle). */
export interface TableauEmbed {
  readonly view: string;
  readonly recordId: string;
  readonly title: string;
  readonly role: 'primary' | 'related';
  /** The view's chart type (bars, bubble, table), for sizing. */
  readonly vizKind?: string;
  /** Mock view page (iframe) or, in real mode, the view's address on the Tableau server for <tableau-viz>. */
  readonly url?: string;
  readonly src?: string;
  readonly mode?: string;
  readonly presentation?: string;
  readonly filters: Readonly<Record<string, readonly string[]>>;
  readonly filtersByCaption?: Readonly<Record<string, readonly string[]>>;
  readonly highlight?: readonly string[];
  readonly highlightCaption?: string;
  readonly parameters: readonly { readonly name: string; readonly caption: string; readonly value: number | string; readonly tableauName?: string }[];
  /** The parameter the what-if slider drives on this view, or null when the view can't show the move. */
  readonly bind?: 'shock_pct' | 'market_spot' | null;
  readonly notes: readonly string[];
  readonly cannotApply: readonly string[];
  /** The view can't take this question's scope (for example a fixed window): shown as a note, never with a wrong scope. */
  readonly skipped?: boolean;
  readonly whyNot?: string;
}

export interface ViewsBlock {
  readonly kind: 'views';
  readonly embeds: readonly TableauEmbed[];
}

export type ScenarioStatus = 'KO' | 'EXP' | 'EXP(Below Strike)' | 'EX';

export interface ScenarioBreakdown {
  readonly key: string;
  readonly label: string;
  readonly changed_hkd: number;
  readonly changed_positions: number;
  readonly exposed_hkd: number;
}

/** One slider step, worked out by the agent's what-if engine. The screen only picks a step; it never computes. */
export interface ScenarioStep {
  readonly move: number;
  readonly label: string;
  readonly narrative: string;
  readonly statuses: Readonly<Record<ScenarioStatus, { readonly hkd: number; readonly positions: number }>>;
  readonly changed: { readonly positions: number; readonly deals: number; readonly customers: number; readonly hkd: number; readonly share: number; readonly worse: number; readonly better: number };
  readonly transitions: readonly { readonly from: ScenarioStatus; readonly to: ScenarioStatus; readonly positions: number; readonly hkd: number }[];
  readonly knock_in_new: { readonly positions: number; readonly hkd: number };
  readonly near_ki: { readonly positions: number; readonly hkd: number };
  readonly ko_lost: { readonly positions: number; readonly hkd: number };
  readonly by_segment: readonly ScenarioBreakdown[];
  readonly by_district: readonly ScenarioBreakdown[];
  readonly by_branch: readonly ScenarioBreakdown[];
}

export interface ScenarioLadderRow {
  readonly pos_id: string;
  readonly cif_id: string;
  readonly segment: string;
  readonly branch: string;
  readonly hkd: number;
  readonly basket: readonly string[];
  readonly strike: number;
  readonly ki: number;
  readonly ko: number;
  readonly knocked_in: boolean;
  readonly now: { readonly wps: string; readonly mtm: number; readonly status: ScenarioStatus };
  /** Per slider step: [simulated worst-of level %, predicted result, worst-of stock]. */
  readonly path: readonly (readonly [number, ScenarioStatus, string])[];
}

export interface ScenarioSpec {
  readonly kind: 'single' | 'market';
  readonly ticker: string | null;
  readonly label: string;
  readonly move: number;
  readonly assumption?: string | null;
  readonly near_ki_points: number;
  readonly control: { readonly name: 'shock_pct' | 'market_spot'; readonly caption: string; readonly unit: 'move' | 'spot' };
  readonly moves: readonly number[];
  readonly asked_index: number;
  readonly universe: { readonly positions: number; readonly deals: number; readonly customers: number; readonly hkd: number; readonly as_wps: number };
  readonly grid: readonly ScenarioStep[];
  readonly ladder: readonly ScenarioLadderRow[];
  readonly source: string;
  readonly checked: boolean;
}

export interface ScenarioBlock {
  readonly kind: 'scenario';
  readonly spec: ScenarioSpec;
}

export type AnswerBlock =
  | TextBlock
  | ViewsBlock
  | ScenarioBlock
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
  /**
   * Pipeline answers: a value the user named fits several stored values, or none (`ambiguous`, `not_found`), or the
   * question itself can be read more than one way (`reading`: "Did you mean"). The options are real values or
   * readings to pick from; each carries the question that answers it.
   */
  readonly clarify?: {
    readonly kind: 'ambiguous' | 'not_found' | 'reading';
    /** What the value is, in plain words: "branch", "district". */
    readonly label: string;
    readonly options: readonly { readonly label: string; readonly question: string }[];
  };
  /** Pipeline answers: the catalog terms the question was read as. `gap` marks a term no published view carries. */
  readonly understood?: readonly { readonly label: string; readonly value?: string; readonly gap: boolean }[];
}
