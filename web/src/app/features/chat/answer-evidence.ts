import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { EvidenceBlock, NoticesBlock } from '../../core/chat/chat.models';

/** The validation caveats on an answer: predicted figures, workarounds, scope limits. */
@Component({
  selector: 'eli-answer-notices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="hd">System notes</span>
    @for (n of block().items; track $index) {
      <p class="n" [class]="'n ' + n.level"><b>{{ n.label }}</b>{{ n.text }}</p>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--eli-space-3); }
    .n { margin: 0; padding: var(--eli-space-3) var(--eli-space-5); border-left: 3px solid var(--eli-accent-link); border-radius: var(--eli-radius-s); background: var(--eli-bg-canvas); color: var(--eli-text-primary); font-size: var(--eli-font-size-s); line-height: var(--eli-line-height-s); }
    .n.warn { border-left-color: var(--eli-accent-orange); } .n.error { border-left-color: var(--eli-status-negative); }
    .hd { color: var(--eli-text-muted-2); font-size: var(--eli-font-size-xs); font-weight: var(--eli-weight-semibold); letter-spacing: 0.06em; text-transform: uppercase; }
    b { margin-right: var(--eli-space-4); color: var(--eli-text-muted-2); font-size: var(--eli-font-size-xs); font-weight: var(--eli-weight-semibold); letter-spacing: 0.06em; text-transform: uppercase; }
  `,
})
export class AnswerNotices {
  readonly block = input.required<NoticesBlock>();
}

/** Sources and proofs, then how the answer was produced (Ask MIRA's layout). Open by default (Hawk: don't collapse). */
@Component({
  selector: 'eli-answer-evidence',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details open>
      <summary>Sources and proofs · {{ figures().length }} {{ figures().length === 1 ? 'figure' : 'figures' }} · {{ block().views.length }} {{ block().views.length === 1 ? 'source' : 'sources' }}</summary>
      @if (figures().length) {
        <table class="proofs">
          <thead><tr><th scope="col">Figure</th><th scope="col">What it is</th><th scope="col">Read from</th></tr></thead>
          <tbody>
            @for (f of figures(); track $index) {
              <tr><td class="fig"><span class="tick" aria-hidden="true">✓</span>{{ f.display }}</td><td>{{ measureLabel(f.measure) }}</td><td class="mono">{{ f.source }}</td></tr>
            }
          </tbody>
        </table>
      }
      @for (v of block().views; track $index) {
        <div class="src">
          <span class="src-ic" aria-hidden="true">▦</span>
          <div class="src-body">
            <div class="src-head"><b>{{ v.view }}</b><span class="muted">Tableau view · {{ v.rows }} rows read</span>
              @if (tableauUrl()) {<a [href]="tableauUrl()" target="_blank" rel="noopener">Open in Tableau ↗</a>}
            </div>
            <div class="mono req">{{ v.request }}</div>
            @if (v.proven.length) {<div class="muted">Proven by the catalog: {{ v.proven.join('; ') }}</div>}
          </div>
        </div>
      }
      @if (block().assumptions.length) {<p class="muted assume">Assumed: {{ block().assumptions.join(' ') }}</p>}
    </details>
    @if (block().steps.length) {
      <details open>
        <summary>How this was produced{{ model() ? ' · ' + model() : '' }} · {{ seconds() }}</summary>
        <ol class="steps">
          @for (s of block().steps; track s.n) {
            <li [class.ai]="s.name.startsWith('Gemini')"><span class="dot" aria-hidden="true"></span><span class="nm">{{ s.name }}</span><span class="dt" [title]="s.detail">{{ s.detail }}</span><span class="ms">{{ s.ms }} ms</span></li>
          }
        </ol>
        <p class="muted contract">Code picked the view, the filters and every figure. The model only read the question and wrote the words, and any figure not in the Tableau rows is rejected.</p>
      </details>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--eli-space-6); padding-top: var(--eli-space-6); border-top: 1px solid var(--eli-separator); }
    summary { cursor: pointer; color: var(--eli-text-muted-2); font-size: var(--eli-font-size-xs); font-weight: var(--eli-weight-semibold); letter-spacing: 0.06em; text-transform: uppercase; }
    details[open] summary { margin-bottom: var(--eli-space-5); }
    .muted { color: var(--eli-text-muted); font-size: var(--eli-font-size-s); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: var(--eli-font-size-xs); overflow-wrap: anywhere; }
    .proofs { width: 100%; border-collapse: collapse; margin-bottom: var(--eli-space-6); font-size: var(--eli-font-size-s); font-variant-numeric: tabular-nums;
      th { padding: var(--eli-space-2) var(--eli-space-4); border-bottom: 1px solid var(--eli-border); color: var(--eli-text-muted); font-weight: var(--eli-weight-semibold); text-align: left; }
      td { padding: var(--eli-space-3) var(--eli-space-4); border-bottom: 1px solid var(--eli-separator); color: var(--eli-text-primary); } }
    .fig { color: var(--eli-text-strong); white-space: nowrap; }
    .tick { margin-right: var(--eli-space-3); color: var(--eli-status-positive-text); }
    .src { display: flex; gap: var(--eli-space-5); padding: var(--eli-space-4) 0; }
    .src-ic { color: var(--eli-accent-orange); }
    .src-body { display: flex; flex-direction: column; gap: var(--eli-space-2); min-width: 0; }
    .src-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--eli-space-5); color: var(--eli-text-strong); font-size: var(--eli-font-size-s);
      a { margin-left: auto; color: var(--eli-accent-link); text-decoration: none; } }
    .req { color: var(--eli-text-muted); }
    .assume { margin: var(--eli-space-3) 0 0; }
    .steps { margin: 0; padding: 0 0 0 var(--eli-space-2); list-style: none; display: flex; flex-direction: column; font-size: var(--eli-font-size-xs); }
    li { position: relative; display: grid; grid-template-columns: 14px 150px minmax(0, 1fr) 60px; gap: var(--eli-space-4); align-items: baseline; padding: var(--eli-space-2) 0; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--eli-status-positive); align-self: center; }
    li.ai .dot { background: var(--eli-accent-link); }
    li.ai .nm { color: var(--eli-accent-link); }
    .nm { color: var(--eli-text-strong); }
    .dt { color: var(--eli-text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ms { color: var(--eli-text-muted); text-align: right; font-variant-numeric: tabular-nums; }
    .contract { margin: var(--eli-space-4) 0 0; }
  `,
})
export class AnswerEvidence {
  readonly block = input.required<EvidenceBlock>();
  readonly figures = input<readonly { display: string; measure: string; source: string }[]>([]);
  readonly model = input<string | undefined>();
  readonly latencyMs = input<number | undefined>();
  readonly tableauUrl = input<string | undefined>();

  protected seconds(): string {
    const ms = this.latencyMs() ?? this.block().steps.reduce((s, x) => s + x.ms, 0);
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)} ms`;
  }

  protected measureLabel(m: string): string {
    return ({ hkd: 'Amount (HKD)', share: 'Share of all outstanding', customers: 'Distinct customers', positions: 'Positions', date: 'Date' } as Record<string, string>)[m] ?? m;
  }
}
