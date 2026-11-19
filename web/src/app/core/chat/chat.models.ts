import { TableauParity } from '../parity/tableau-parity';
import { MomentType } from '../models/today.models';

/**
 * The Chat tab's data contract. An answer is a list of typed blocks, so figures are shown
 * as rendered data (tables, bars) and only the words around them come from the model.
 */
export interface ChatQuestion {
  readonly text: string;
  /** The client the question is about, if the RM picked one (picked on Today). */
  readonly clientId: string | null;
}

export interface TextBlock {
  readonly kind: 'text';
  readonly text: string;
}

export interface FactsBlock {
  readonly kind: 'facts';
  readonly items: readonly { readonly label: string; readonly value: string }[];
}

export interface ClientRowsBlock {
  readonly kind: 'clients';
  readonly title: string;
  readonly rows: readonly {
    readonly clientId: string;
    readonly name: string;
    readonly type: MomentType;
    readonly when: string;
    readonly amountUsd: number | null;
    readonly note: string;
  }[];
}

export interface ConcentrationBlock {
  readonly kind: 'concentration';
  readonly title: string;
  readonly lines: readonly { readonly underlying: string; readonly sharePct: number; readonly limitPct: number }[];
}

export interface IdeasBlock {
  readonly kind: 'ideas';
  readonly clientId: string;
  readonly title: string;
  readonly ideas: readonly {
    readonly id: string;
    readonly title: string;
    readonly tenor: string;
    readonly couponPct: number;
    readonly kiPct: number;
    readonly concentration: string;
  }[];
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
  | FactsBlock
  | ClientRowsBlock
  | ConcentrationBlock
  | IdeasBlock
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
  /** How the figures compare with the Tableau view users know (R36). Absent when no view applies. */
  readonly parity?: TableauParity;
  /** Pipeline answers: the population the figures cover, e.g. "TRE · predicted maturity next 30 days". */
  readonly scope?: string;
  /** Pipeline answers: when the Tableau data was refreshed (ISO), next to the business date. */
  readonly refreshedAt?: string;
  /** Pipeline answers: the same Tableau view with the same filters, one click away. */
  readonly tableauUrl?: string;
}
