import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { EvidenceBlock, NoticesBlock } from '../../core/chat/chat.models';

/** The validation caveats on an answer: predicted figures, workarounds, scope limits. */
@Component({
  selector: 'eli-answer-notices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (n of block().items; track $index) {
      <p class="n" [class]="'n ' + n.level"><b>{{ n.label }}</b>{{ n.text }}</p>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--eli-space-3); }
    .n { margin: 0; padding: var(--eli-space-3) var(--eli-space-5); border-left: 3px solid var(--eli-accent-link); border-radius: var(--eli-radius-s); background: var(--eli-bg-canvas); color: var(--eli-text-primary); font-size: var(--eli-font-size-s); line-height: var(--eli-line-height-s); }
    .n.warn { border-left-color: var(--eli-accent-orange); } .n.error { border-left-color: var(--eli-status-negative); }
    b { margin-right: var(--eli-space-4); color: var(--eli-text-muted-2); font-size: var(--eli-font-size-xs); font-weight: var(--eli-weight-semibold); letter-spacing: 0.06em; text-transform: uppercase; }
  `,
})
export class AnswerNotices {
  readonly block = input.required<NoticesBlock>();
}

/** How the answer was made: the Tableau view and request, the rows read, and each pipeline step. Open by default (Hawk). */
@Component({
  selector: 'eli-answer-evidence',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details open>
      <summary>Evidence: Tableau view, filters and rows</summary>
      @for (v of block().views; track $index) {
        <dl class="kv">
          <dt>View</dt><dd>{{ v.view }}</dd>
          <dt>Request</dt><dd class="mono">{{ v.request }}</dd>
          <dt>Rows read</dt><dd>{{ v.rows }}</dd>
          @if (v.proven.length) {<dt>Proven by catalog</dt><dd>{{ v.proven.join('; ') }}</dd>}
        </dl>
      }
      @if (block().assumptions.length) {
        <dl class="kv"><dt>Assumed</dt><dd>{{ block().assumptions.join(' ') }}</dd></dl>
      }
    </details>
    @if (block().steps.length) {
      <details open>
        <summary>Agent pipeline: {{ block().steps.length }} steps</summary>
        <ol class="steps">
          @for (s of block().steps; track s.n) {
            <li><span class="no">{{ s.n }}</span><span class="nm">{{ s.name }}</span><span class="dt">{{ s.detail }}</span><span class="ms">{{ s.ms }} ms</span></li>
          }
        </ol>
      </details>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--eli-space-5); padding-top: var(--eli-space-6); border-top: 1px solid var(--eli-separator); }
    summary { cursor: pointer; color: var(--eli-text-muted-2); font-size: var(--eli-font-size-xs); font-weight: var(--eli-weight-semibold); letter-spacing: 0.06em; text-transform: uppercase; }
    details[open] summary { margin-bottom: var(--eli-space-4); }
    .kv { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: var(--eli-space-2) var(--eli-space-6); margin: 0 0 var(--eli-space-4); font-size: var(--eli-font-size-s); }
    dt { color: var(--eli-text-muted); } dd { margin: 0; color: var(--eli-text-primary); overflow-wrap: anywhere; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: var(--eli-font-size-xs); }
    .steps { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--eli-space-2); font-size: var(--eli-font-size-xs); }
    li { display: grid; grid-template-columns: 18px 130px minmax(0, 1fr) 56px; gap: var(--eli-space-4); align-items: baseline; }
    .no { color: var(--eli-accent-orange); font-weight: var(--eli-weight-semibold); }
    .nm { color: var(--eli-text-strong); }
    .dt { color: var(--eli-text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ms { color: var(--eli-text-muted); text-align: right; font-variant-numeric: tabular-nums; }
  `,
})
export class AnswerEvidence {
  readonly block = input.required<EvidenceBlock>();
}
