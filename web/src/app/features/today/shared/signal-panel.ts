import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Signal } from '../../../core/models/today.models';

/** The six signals behind an agreement count: the rule, why it matters, any caveat and its source. */
@Component({
  selector: 'eli-signal-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3 class="head">{{ heading() }}</h3>
    <ol class="list">
      @for (s of signals(); track s.id; let i = $index) {
        <li class="sig" [class.met]="s.met">
          <p class="name"><span class="mark" aria-hidden="true">{{ s.met ? '●' : '○' }}</span> Signal {{ i + 1 }} of {{ signals().length }} · {{ s.name }} <span class="eli-visually-hidden">{{ s.met ? 'agrees' : 'does not agree' }}</span></p>
          <p class="label">The rule</p>
          <p class="text">{{ s.rule }}</p>
          @if (s.met) {
            <p class="label">Why it matters</p>
            <p class="text">{{ s.whyItMatters }}</p>
          }
          @if (s.caveat) {
            <p class="label">Caveat</p>
            <p class="text">{{ s.caveat }}</p>
          }
          <p class="source">Source: {{ s.source }}</p>
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      display: block; width: 380px; max-height: 420px; overflow: auto; padding: var(--eli-space-6) var(--eli-space-7);
      border: 1px solid var(--eli-accent-link); border-radius: var(--eli-radius-s);
      background: var(--eli-bg-input); box-shadow: var(--eli-shadow-overlay); color: var(--eli-text-primary);
    }
    .head { margin: 0 0 var(--eli-space-4); color: var(--eli-text-strong); font-size: var(--eli-font-size-m); font-weight: var(--eli-weight-semibold); }
    .list { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--eli-space-6); }
    .sig { opacity: 0.7; }
    .sig.met { opacity: 1; }
    .name { margin: 0 0 var(--eli-space-2); font-weight: var(--eli-weight-semibold); font-size: var(--eli-font-size-s); }
    .mark { color: var(--eli-accent-link); }
    .label { margin: var(--eli-space-2) 0 0; color: var(--eli-text-muted); font-size: var(--eli-font-size-xs); text-transform: uppercase; letter-spacing: var(--eli-tracking-eyebrow); }
    .text { margin: 0; font-size: var(--eli-font-size-s); line-height: var(--eli-line-height-s); }
    .source { margin: var(--eli-space-2) 0 0; color: var(--eli-accent-link); font-size: var(--eli-font-size-xs); }
  `,
})
export class SignalPanel {
  readonly signals = input.required<readonly Signal[]>();
  readonly heading = input('Why this is on the list');
}
