import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Idea } from '../../../core/models/today.models';
import { AgreementDots } from '../shared/agreement-dots';
import { ConcentrationBar } from '../shared/concentration-bar';

/** One ranked idea: terms, pricing time, agreement, what it does to concentration, and the next step. */
@Component({
  selector: 'eli-idea-card',
  imports: [MatButtonModule, MatIconModule, AgreementDots, ConcentrationBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card" [class.lead]="idea().rank === 1" [attr.aria-label]="'Idea ' + idea().rank + ': ' + idea().title">
      <h3 class="title"><span class="rank">#{{ idea().rank }}</span> {{ idea().title }}</h3>
      <p class="terms">KI {{ idea().terms.kiPct }}% · strike {{ idea().terms.strikePct }}% · coupon {{ idea().terms.couponPct }}% p.a.</p>
      <p class="priced">Priced {{ priced() }} · indicative, not a live quote</p>
      <eli-agreement-dots [signals]="idea().signals" />
      <eli-concentration-bar [underlying]="idea().concentration.underlying" [fromPct]="idea().concentration.fromPct" [toPct]="idea().concentration.toPct" [limitPct]="idea().concentration.limitPct" />
      <p class="reason">{{ idea().reason }}</p>
      <div class="actions">
        @if (quoteRequested()) {
          <span class="done"><mat-icon svgIcon="check" aria-hidden="true" />Quote requested</span>
        } @else {
          <button [matButton]="idea().rank === 1 ? 'filled' : 'outlined'" type="button" (click)="requestQuote.emit(idea())">Request live quote</button>
        }
        <button matButton type="button" [attr.aria-pressed]="inCallNotes()" (click)="toggleNote.emit(idea())">
          {{ inCallNotes() ? 'In call notes ✓' : 'Add to call notes' }}
        </button>
      </div>
    </article>
  `,
  styles: `
    .card { display: flex; flex-direction: column; gap: var(--eli-space-4); height: 100%; padding: var(--eli-space-7); border: 1px solid transparent; border-radius: var(--eli-radius-s); background: var(--eli-bg-surface); }
    .card.lead { border-color: var(--eli-accent-link); }
    .title { margin: 0; color: var(--eli-text-strong); font-size: var(--eli-font-size-l); font-weight: var(--eli-weight-semibold); }
    .rank { color: var(--eli-accent-orange); font-size: var(--eli-font-size-s); }
    .terms { margin: 0; color: var(--eli-text-strong); font-weight: var(--eli-weight-semibold); }
    .priced { margin: 0; color: var(--eli-text-muted); font-size: var(--eli-font-size-s); }
    .reason { margin: 0; color: var(--eli-text-primary); }
    .actions { display: flex; align-items: center; gap: var(--eli-space-4); flex-wrap: wrap; margin-top: auto; }
    .done { display: inline-flex; align-items: center; gap: var(--eli-space-2); color: var(--eli-status-positive); font-size: var(--eli-font-size-s); font-weight: var(--eli-weight-semibold); mat-icon { width: 14px; height: 14px; } }
  `,
})
export class IdeaCard {
  readonly idea = input.required<Idea>();
  readonly priced = input.required<string>();
  readonly inCallNotes = input(false);
  readonly quoteRequested = input(false);
  readonly requestQuote = output<Idea>();
  readonly toggleNote = output<Idea>();
}
