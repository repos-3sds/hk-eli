import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { AnswerCard } from './answer-card';
import { ChatStore } from './chat.store';

const STARTERS = ['Who matures this week?', 'Which knock-outs are close to the barrier?', 'Prepare me for my call with Chan', 'Who matures next week?'];

/**
 * The Chat tab. A question from Today arrives as ?q=…&client=… and is asked once; the URL is then cleaned
 * so a reload does not ask again. Answers are typed blocks with a trust line; nothing is sent to a client from here.
 */
@Component({
  selector: 'eli-chat-page',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatTooltipModule, AnswerCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scroll eli-scroll" #scroller>
      <div class="column">
        @if (store.turns().length === 0) {
          <section class="empty">
            <mat-icon svgIcon="message-square" aria-hidden="true" />
            <h2 class="title">Ask about your book</h2>
            <p class="lede">Answers come from the blotter, fixings and RFQ log. Figures are computed; only the words come from AI.</p>
            <div class="chips">
              @for (q of starters; track q) {
                <button type="button" class="chip" (click)="store.send(q)"><mat-icon svgIcon="sparkles" aria-hidden="true" />{{ q }}</button>
              }
            </div>
          </section>
        } @else {
          <div class="head">
            <span class="eli-eyebrow">This conversation</span>
            <button matButton type="button" (click)="store.clear()">Start over</button>
          </div>
          <ol class="thread" aria-live="polite">
            @for (t of store.turns(); track t.id) {
              <li class="turn">
                <p class="question">{{ t.question }}</p>
                @switch (t.status) {
                  @case ('pending') {
                    <div class="pending" role="status"><span class="dot"></span><span class="dot"></span><span class="dot"></span>Reading the blotter and fixings…</div>
                  }
                  @case ('error') {
                    <div class="error" role="alert">
                      <mat-icon svgIcon="circle-alert" aria-hidden="true" />
                      <span>{{ t.error }}</span>
                      <button matButton="outlined" type="button" (click)="store.retry(t.id)">Try again</button>
                    </div>
                  }
                  @case ('done') {
                    <eli-answer-card [answer]="t.answer!" (followUp)="store.send($event)" />
                  }
                }
              </li>
            }
          </ol>
        }
      </div>
    </div>

    <form class="box" (submit)="submit($event)" role="search" aria-label="Ask the HK ELI Chatbot">
      @if (store.clientShortName(); as name) {
        <span class="ctx">Client: {{ name }}
          <button type="button" class="clear" (click)="store.clientId.set(null)" [attr.aria-label]="'Clear client ' + name" matTooltip="Clear: ask about your whole book"><mat-icon svgIcon="x" /></button>
        </span>
      }
      <label class="eli-visually-hidden" for="chat-ask">Ask a question</label>
      <textarea #input id="chat-ask" name="ask" rows="2" class="input" placeholder="Ask about a client, an underlying or an idea…  (Enter to send, Shift+Enter for a new line)"
        [ngModel]="store.draft()" (ngModelChange)="store.draft.set($event)" (keydown.enter)="onEnter($event)"></textarea>
      <button type="submit" class="send" [disabled]="!store.draft().trim() || store.busy()" aria-label="Send question"><mat-icon svgIcon="send" /></button>
    </form>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--eli-space-7); height: 100%; padding: var(--eli-space-4) var(--eli-space-7); }
    .scroll { flex: 1; min-height: 0; overflow: auto; }
    .column, .box { width: 100%; max-width: 1000px; margin: 0 auto; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: var(--eli-space-5); padding: 12vh 0 var(--eli-space-8); text-align: center; }
    .empty > mat-icon { width: 32px; height: 32px; color: var(--eli-accent-orange); }
    .title { margin: 0; color: var(--eli-text-strong); font-size: 28px; line-height: 36px; font-weight: var(--eli-weight-semibold); }
    .lede { max-width: 560px; margin: 0; color: var(--eli-text-muted-2); }
    .chips { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--eli-space-4); margin-top: var(--eli-space-6); }
    .chip { display: inline-flex; align-items: center; gap: var(--eli-space-3); height: 30px; padding: 0 var(--eli-space-6); border: 1px solid var(--eli-border); border-radius: 15px; background: var(--eli-bg-dock); color: var(--eli-text-primary); font: inherit; font-size: var(--eli-font-size-s); cursor: pointer;
      &:hover { border-color: var(--eli-accent-link); color: var(--eli-text-strong); } mat-icon { width: 14px; height: 14px; color: var(--eli-accent-link); } }
    .head { display: flex; align-items: center; justify-content: space-between; padding: var(--eli-space-6) 0; }
    .thread { display: flex; flex-direction: column; gap: var(--eli-space-8); margin: 0; padding: 0 0 var(--eli-space-7); list-style: none; }
    .turn { display: flex; flex-direction: column; gap: var(--eli-space-6); }
    .question { align-self: flex-end; max-width: 70%; margin: 0; padding: var(--eli-space-5) var(--eli-space-7); border-radius: 14px 14px 4px 14px; background: var(--eli-bg-selected); color: var(--eli-text-strong); }
    .pending { display: flex; align-items: center; gap: var(--eli-space-3); color: var(--eli-text-muted-2); font-size: var(--eli-font-size-s); }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--eli-accent-link); animation: blink 1.2s infinite; &:nth-child(2) { animation-delay: .2s; } &:nth-child(3) { animation-delay: .4s; margin-right: var(--eli-space-3); } }
    @keyframes blink { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
    .error { display: flex; align-items: center; gap: var(--eli-space-6); padding: var(--eli-space-6) var(--eli-space-7); border-left: 3px solid var(--eli-status-negative); border-radius: var(--eli-radius-s); background: var(--eli-bg-surface); color: var(--eli-text-primary);
      mat-icon { flex: none; width: 18px; height: 18px; color: var(--eli-status-negative); } span { flex: 1; } }
    .box { display: flex; align-items: flex-start; gap: var(--eli-space-4); flex: none; padding: var(--eli-space-6) var(--eli-space-7); border: 1px solid var(--eli-border); border-radius: 14px; background: var(--eli-bg-input);
      &:focus-within { border-color: var(--eli-accent-link); } }
    .ctx { display: inline-flex; align-items: center; gap: var(--eli-space-2); flex: none; height: 22px; padding: 0 var(--eli-space-2) 0 var(--eli-space-4); border-radius: var(--eli-radius-s); background: var(--eli-bg-selected); color: var(--eli-text-primary); font-size: var(--eli-font-size-s); font-weight: var(--eli-weight-semibold); }
    .clear { display: grid; place-items: center; padding: 0; border: 0; background: none; color: var(--eli-text-muted-2); cursor: pointer; mat-icon { width: 12px; height: 12px; } }
    .input { flex: 1; min-width: 0; border: 0; outline: 0; resize: none; padding: 0; background: none; color: var(--eli-text-primary); font: inherit; line-height: 20px; &::placeholder { color: var(--eli-text-muted); } }
    .send { align-self: flex-end; display: grid; place-items: center; padding: 0; border: 0; background: none; color: var(--eli-text-strong); cursor: pointer; &:disabled { color: var(--eli-text-muted); cursor: default; } mat-icon { width: 18px; height: 18px; } }
  `,
})
export class ChatPage {
  protected readonly store = inject(ChatStore);
  private readonly router = inject(Router);
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  protected readonly starters = STARTERS;

  /** From the URL (?q=…&client=…), bound by the router. */
  readonly q = input<string | undefined>();
  readonly client = input<string | undefined>();

  constructor() {
    // A question handed over from Today: ask it once, then drop it from the URL.
    effect(() => {
      const q = this.q();
      const client = this.client() ?? null;
      if (!q) {
        return;
      }
      untracked(() => {
        this.store.clientId.set(client);
        this.store.send(q, client);
        void this.router.navigate([], { queryParams: {}, replaceUrl: true });
      });
    });
    // Keep the newest answer in view.
    effect(() => {
      this.store.turns();
      queueMicrotask(() => {
        const el = this.scroller().nativeElement;
        el.scrollTo?.({ top: el.scrollHeight, behavior: 'smooth' });
      });
    });
  }

  protected onEnter(event: Event): void {
    const key = event as KeyboardEvent;
    if (key.shiftKey || key.isComposing) {
      return;
    }
    this.submit(event);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (!this.store.busy()) {
      this.store.send(this.store.draft());
    }
  }
}
