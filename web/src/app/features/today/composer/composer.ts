import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { TodayStore } from '../today.store';

/** Ask box at the foot of Today. A question goes to the Chat tab, carrying the client context. */
@Component({
  selector: 'eli-composer',
  imports: [FormsModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="box" (submit)="send($event)" role="search" aria-label="Ask the HK ELI Chatbot">
      @if (store.linkedContext(); as ctx) {
        <span class="ctx">
          <mat-icon svgIcon="link" aria-hidden="true" />
          Client: {{ ctx.clientShortName }} · from {{ ctx.fromWidget }}
          <button type="button" class="clear" (click)="store.clearLinkedContext()" [attr.aria-label]="'Clear client context ' + ctx.clientShortName" matTooltip="Clear: back to your whole book"><mat-icon svgIcon="x" /></button>
        </span>
      }
      <label class="eli-visually-hidden" for="ask">Ask about a client, an underlying or an idea</label>
      <input #input id="ask" name="ask" class="input" autocomplete="off" placeholder="Ask about a client, an underlying or an idea…"
        [ngModel]="store.composerDraft()" (ngModelChange)="store.composerDraft.set($event)" />
      <button type="submit" class="send" [disabled]="!store.composerDraft().trim()" aria-label="Send question"><mat-icon svgIcon="send" /></button>
    </form>
  `,
  styles: `
    .box {
      display: flex; align-items: center; gap: var(--eli-space-4); min-height: 42px; padding: var(--eli-space-3) var(--eli-space-6);
      border: 1px solid var(--eli-border); border-radius: var(--eli-radius-s); background: var(--eli-bg-input);
      &:focus-within { border-color: var(--eli-accent-link); }
    }
    .ctx {
      display: inline-flex; align-items: center; gap: var(--eli-space-2); flex: none; height: 20px; padding: var(--eli-space-1) var(--eli-space-2) var(--eli-space-1) var(--eli-space-4);
      border-radius: var(--eli-radius-s); background: var(--eli-bg-selected); color: var(--eli-text-primary);
      font-size: var(--eli-font-size-s); font-weight: var(--eli-weight-semibold);
      mat-icon { width: 12px; height: 12px; }
    }
    .clear { display: grid; place-items: center; padding: 0; border: 0; background: none; color: var(--eli-text-muted-2); cursor: pointer; }
    .input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; color: var(--eli-text-primary); font: inherit; &::placeholder { color: var(--eli-text-muted); } }
    .send { display: grid; place-items: center; padding: 0; border: 0; background: none; color: var(--eli-text-strong); cursor: pointer; &:disabled { color: var(--eli-text-muted); cursor: default; } mat-icon { width: 18px; height: 18px; } }
  `,
})
export class Composer {
  protected readonly store = inject(TodayStore);
  private readonly router = inject(Router);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  constructor() {
    // When a card fills the box ("Ask about Chan"), put the cursor there so the RM can edit or send.
    effect(() => {
      if (this.store.composerDraft()) {
        this.input().nativeElement.focus();
      }
    });
  }

  protected send(event: Event): void {
    event.preventDefault();
    const question = this.store.composerDraft().trim();
    if (!question) {
      return;
    }
    const client = this.store.linkedContext()?.clientId ?? this.store.dockClientId();
    this.store.composerDraft.set('');
    void this.router.navigate(['/rm/chat'], { queryParams: { q: question, client } });
  }
}
