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

export type AnswerBlock = TextBlock | FactsBlock | ClientRowsBlock | ConcentrationBlock | IdeasBlock | BulletsBlock;

export interface ChatAnswer {
  readonly id: string;
  readonly blocks: readonly AnswerBlock[];
  readonly followUps: readonly string[];
  readonly businessDate: string;
  readonly sources: readonly string[];
  /** True when the question was not understood and the answer only suggests what to ask. */
  readonly fallback: boolean;
}
