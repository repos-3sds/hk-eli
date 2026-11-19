import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { ChatDataSource } from '../../core/chat/chat-data-source';
import { ChatAnswer } from '../../core/chat/chat.models';
import { DISCOVERY_QUESTIONS, DiscoveryQuestion } from '../../core/chat/discovery-questions';
import { SessionService } from '../../core/session/session.service';
import { BusinessClock } from '../../core/time/business-clock';

interface Line {
  readonly q: DiscoveryQuestion;
  readonly status: 'loading' | 'done' | 'error';
  readonly answer?: ChatAnswer;
}

const D = DISCOVERY_QUESTIONS;

/** The data refreshes overnight, so one answer per insight per session is enough; going back to Today is instant. */
const SESSION_CACHE = new Map<string, ChatAnswer>();

/** The first sentence, not split inside figures like "HKD 2.46bn." or "10.7%". */
export function firstSentence(text: string): string {
  const m = /^.*?[.!?](?=\s+[A-Z(]|$)/s.exec(text.trim());
  return m ? m[0] : text.trim();
}
/** Today's insights, below the ask box: the book, where it is heading in the next 30 days, and the risk. */
const INSIGHTS: readonly DiscoveryQuestion[] = [D.outstanding, D.calendar, D.branches, D.koShare];
const CHIPS: readonly DiscoveryQuestion[] = [D.branches, D.wps];

/**
 * Today: a calm landing. A big greeting, the ask box with two suggested questions, then today's insights, each the
 * pipeline's own answer from a HK_ELI Tableau view. Charts and evidence live in Chat: any line opens
 * there as a question.
 */
@Component({
  selector: 'eli-book-page',
  imports: [FormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page eli-scroll">
      <main class="col">
        <h2 class="hero"><mat-icon svgIcon="sun" aria-hidden="true" />{{ greeting() }}</h2>
        <p class="lede">Ask anything about the ELI book. Answers come from the HK_ELI Tableau views.</p>

        <form class="ask" (submit)="$event.preventDefault(); ask(draft())">
          <label class="eli-visually-hidden" for="today-ask">Ask about the ELI book</label>
          <input id="today-ask" type="text" name="q" [ngModel]="draft()" (ngModelChange)="draft.set($event)" placeholder="Ask about the ELI book" autocomplete="off" />
          <button type="submit" class="send" [disabled]="!draft().trim()" aria-label="Ask"><mat-icon svgIcon="send" /></button>
        </form>
        <div class="chips" role="group" aria-label="Suggested questions">
          @for (c of chips; track c.id) {
            <button type="button" class="chip" (click)="ask(c.question)"><mat-icon svgIcon="sparkles" aria-hidden="true" />{{ c.question }}</button>
          }
        </div>

        <section class="insights" aria-label="Today's insights">
          <h3 class="ins-title">Today's insights</h3>
          <ul class="brief">
            @for (l of lines(); track l.q.id) {
              <li>
                <button type="button" class="line" (click)="ask(l.q.question)" [title]="'Open in Chat: ' + l.q.question">
                  <mat-icon class="b-icon" [svgIcon]="l.q.icon" aria-hidden="true" />
                  <span class="b-text">
                    @switch (l.status) {
                      @case ('loading') {<span class="ghost">{{ l.q.title }}…</span>}
                      @case ('error') {<span class="ghost">{{ l.q.title }}: no answer.</span>}
                      @default {{{ text(l.answer!) }}}
                    }
                  </span>
                  <mat-icon class="go" svgIcon="chevron-right" aria-hidden="true" />
                </button>
              </li>
            }
          </ul>
          @if (asOf(); as a) {<p class="asof"><mat-icon svgIcon="info" aria-hidden="true" />{{ a }}</p>}
        </section>
      </main>
    </div>
  `,
  styles: `
    :host { display: block; height: 100%; }
    .page { height: 100%; overflow: auto; box-sizing: border-box; padding: 6vh var(--eli-space-7) var(--eli-space-8); }
    .col { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--eli-space-7); }
    .hero { display: flex; align-items: center; gap: var(--eli-space-6); margin: 0; color: var(--eli-text-strong); font-size: 34px; line-height: 42px; font-weight: var(--eli-weight-semibold); mat-icon { width: 32px; height: 32px; color: var(--eli-accent-orange); } }
    .lede { margin: calc(-1 * var(--eli-space-4)) 0 0; color: var(--eli-text-muted-2); font-size: var(--eli-font-size-l); }
    .insights { display: flex; flex-direction: column; gap: var(--eli-space-4); margin-top: var(--eli-space-7); }
    .ins-title { margin: 0; color: var(--eli-text-muted-2); font-size: var(--eli-font-size-xs); font-weight: var(--eli-weight-semibold); letter-spacing: 0.06em; text-transform: uppercase; }
    .ghost { color: var(--eli-text-muted); font-weight: var(--eli-weight-regular); }
    .brief { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; border-top: 1px solid var(--eli-separator); }
    .line { display: flex; align-items: flex-start; gap: var(--eli-space-6); width: 100%; padding: var(--eli-space-6) var(--eli-space-2); border: 0; border-bottom: 1px solid var(--eli-separator); background: none; color: var(--eli-text-primary); font: inherit; font-size: var(--eli-font-size-m); line-height: var(--eli-line-height-l); text-align: left; cursor: pointer;
      &:hover { background: var(--eli-bg-row); .go { opacity: 1; } } }
    .b-icon { flex: none; width: 16px; height: 16px; margin-top: 3px; color: var(--eli-accent-orange); }
    .b-text { flex: 1; }
    .go { flex: none; width: 16px; height: 16px; margin-top: 3px; color: var(--eli-accent-link); opacity: 0.4; }
    .ask { display: flex; align-items: center; gap: var(--eli-space-4); padding: var(--eli-space-3) var(--eli-space-3) var(--eli-space-3) var(--eli-space-7); border: 1px solid var(--eli-border); border-radius: var(--eli-radius-m); background: var(--eli-bg-input);
      &:focus-within { border-color: var(--eli-focus-ring); } }
    .ask input { flex: 1; min-width: 0; height: 40px; border: 0; outline: 0; background: none; color: var(--eli-text-primary); font: inherit; font-size: var(--eli-font-size-l); }
    .send { display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 50%; background: var(--eli-accent-blue); color: #fff; cursor: pointer;
      &:disabled { background: var(--eli-bg-row); color: var(--eli-text-muted); cursor: default; } mat-icon { width: 16px; height: 16px; } }
    .chips { display: flex; flex-wrap: wrap; gap: var(--eli-space-4); }
    .chip { display: inline-flex; align-items: center; gap: var(--eli-space-3); height: 30px; padding: 0 var(--eli-space-6); border: 1px solid var(--eli-border); border-radius: 15px; background: var(--eli-bg-dock); color: var(--eli-text-primary); font: inherit; font-size: var(--eli-font-size-s); cursor: pointer;
      &:hover { border-color: var(--eli-accent-link); color: var(--eli-text-strong); } mat-icon { width: 13px; height: 13px; color: var(--eli-accent-link); } }
    .asof { display: flex; align-items: center; gap: var(--eli-space-3); margin: 0; color: var(--eli-text-muted); font-size: var(--eli-font-size-s); mat-icon { width: 14px; height: 14px; } }
  `,
})
export class BookPage {
  private readonly data = inject(ChatDataSource);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly clock = inject(BusinessClock);

  protected readonly chips = CHIPS;
  protected readonly draft = signal('');
  protected readonly lines = signal<readonly Line[]>(INSIGHTS.map((q) => ({ q, status: 'loading' })));

  protected readonly greeting = computed(() => {
    const hour = this.clock.hour();
    const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return `${part}, ${this.session.user().firstName}`;
  });

  protected readonly asOf = computed(() => {
    const a = this.lines().find((l) => l.answer?.businessDate)?.answer;
    if (!a) return null;
    const sources = new Set(this.lines().flatMap((l) => l.answer?.sources ?? []));
    return `Data as of ${a.businessDate}${a.refreshedAt ? `, refreshed ${a.refreshedAt.replace('T', ' ')}` : ''} · from ${sources.size} HK_ELI Tableau views · Internal use only`;
  });

  constructor() {
    INSIGHTS.forEach((q, i) => this.load(q, (l) => this.lines.update((all) => all.map((x, n) => (n === i ? l : x)))));
  }

  protected ask(question: string): void {
    const q = question.trim();
    if (q) void this.router.navigate(['/chat'], { queryParams: { q } });
  }

  /** One sentence per insight: the figure. The full answer, chart and evidence open in Chat. */
  protected text(a: ChatAnswer): string {
    const b = a.blocks[0];
    return b?.kind === 'text' ? firstSentence(b.text) : '';
  }

  private load(q: DiscoveryQuestion, set: (l: Line) => void): void {
    const cached = SESSION_CACHE.get(q.id);
    if (cached) {
      set({ q, status: 'done', answer: cached });
      return;
    }
    this.data.ask({ text: q.question, clientId: null }).subscribe({
      next: (answer) => {
        if (!answer.fallback) SESSION_CACHE.set(q.id, answer);
        set({ q, status: 'done', answer });
      },
      error: () => set({ q, status: 'error' }),
    });
  }
}
