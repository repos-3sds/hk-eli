import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FeedbackStore } from './feedback.store';

/** "Was this useful?" with thumbs and an optional note (R40). Quiet, at the foot of a view. */
@Component({
  selector: 'eli-feedback',
  imports: [FormsModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="ask">Was {{ topicLower() }} useful?</span>
    <button type="button" class="act" [class.on]="rating() === 'up'" [attr.aria-pressed]="rating() === 'up'" aria-label="Useful" matTooltip="Useful" (click)="rate('up')">
      <mat-icon svgIcon="thumbs-up" />
    </button>
    <button type="button" class="act" [class.on]="rating() === 'down'" [attr.aria-pressed]="rating() === 'down'" aria-label="Not useful" matTooltip="Not useful" (click)="rate('down')">
      <mat-icon svgIcon="thumbs-down" />
    </button>
    @if (rating() && !noteSent()) {
      <form class="note" (submit)="$event.preventDefault(); sendNote()">
        <label class="eli-visually-hidden" [for]="id">What would make it better?</label>
        <input [id]="id" name="note" class="input" maxlength="300" placeholder="What would make it better? (optional)" [ngModel]="note()" (ngModelChange)="note.set($event)" />
        <button type="submit" class="eli-link" [disabled]="!note().trim()">Send</button>
      </form>
    } @else if (noteSent()) {
      <span class="thanks" role="status">Thanks. It goes into the weekly feedback summary.</span>
    }
  `,
  styles: `
    :host { display: flex; flex-wrap: wrap; align-items: center; gap: var(--eli-space-3); color: var(--eli-text-muted); font-size: var(--eli-font-size-s); }
    .act {
      display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: var(--eli-radius-s);
      background: none; color: var(--eli-text-muted); cursor: pointer;
      &:hover { background: var(--eli-bg-row); color: var(--eli-text-strong); }
      &.on { color: var(--eli-accent-link); }
      mat-icon { width: 14px; height: 14px; }
    }
    .note { display: inline-flex; align-items: center; gap: var(--eli-space-4); }
    .input {
      width: 260px; height: 26px; padding: 0 var(--eli-space-4); border: 1px solid var(--eli-border); border-radius: var(--eli-radius-s);
      background: var(--eli-bg-input); color: var(--eli-text-primary); font: inherit; font-size: var(--eli-font-size-s);
      &:focus { outline: 0; border-color: var(--eli-accent-link); }
    }
    .eli-link { font-size: inherit; }
    .thanks { color: var(--eli-text-muted-2); }
  `,
})
export class FeedbackButtons {
  private readonly store = inject(FeedbackStore);
  private static count = 0;
  protected readonly id = `fb-note-${++FeedbackButtons.count}`;
  /** What the feedback is about, e.g. "Today's list". */
  readonly topic = input.required<string>();
  protected readonly topicLower = computed(() => this.topic().charAt(0).toLowerCase() + this.topic().slice(1));
  protected readonly rating = computed(() => this.store.ratingFor(this.topic()));
  protected readonly note = signal('');
  protected readonly noteSent = signal(false);

  protected rate(rating: 'up' | 'down'): void {
    this.store.rate(this.topic(), rating);
    this.noteSent.set(false);
  }

  protected sendNote(): void {
    this.store.addNote(this.topic(), this.note());
    this.noteSent.set(true);
  }
}
