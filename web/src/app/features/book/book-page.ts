import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { LibraryChoice, PromptLibraryDialog } from '../chat/prompt-library-dialog';
import { ChatDataSource } from '../../core/chat/chat-data-source';
import { ChatAnswer } from '../../core/chat/chat.models';
import { DISCOVERY_QUESTIONS, DiscoveryQuestion } from '../../core/chat/discovery-questions';
import { Insight, bookTotal, concentration, hotspot, outcomeMix, peakDay } from '../../core/insights/insights';
import { LaunchRole, SessionService } from '../../core/session/session.service';
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
const INSIGHTS: readonly DiscoveryQuestion[] = [D.outstanding, D.wps, D.calendar, D.branches];
/** Two suggestions per persona, from its own library. */
const CHIPS: Record<LaunchRole, readonly string[]> = {
  wms: ['Show the clients behind Central maturing in the next 30 days', 'How many TRE customers are predicted to KO?'],
  pm: ['What share of outstanding ELI does each segment hold?', 'Which WPS has the largest outstanding ELI exposure overall?'],
  tsm: ['Compare outstanding ELI across districts for TRE', 'Which branches have the most TRE maturities in the next 30 days?'],
};

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
          <textarea #box id="today-ask" name="q" rows="3" [ngModel]="draft()" (ngModelChange)="draft.set($event); grow(box)" (keydown)="onKey($event)"
            placeholder="Ask about the ELI book: outstanding, maturities, branches, stocks…" maxlength="500"></textarea>
          <button type="submit" class="send" [disabled]="!draft().trim()" aria-label="Ask"><mat-icon svgIcon="send" /></button>
        </form>
        <p class="hint">Enter to ask · Shift+Enter for a new line · the box grows as you type</p>
        <div class="chips" role="group" aria-label="Suggested questions">
          @for (c of chips(); track c) {
            <button type="button" class="chip" (click)="ask(c)"><mat-icon svgIcon="sparkles" aria-hidden="true" />{{ c }}</button>
          }
          <button type="button" class="chip lib" (click)="openLibrary()"><mat-icon svgIcon="list-checks" aria-hidden="true" />Prompt library</button>
        </div>

        <section class="insights" aria-label="Today's insights">
          <h3 class="ins-title">Today's insights</h3>
          @if (loading()) {
            <p class="ghost">Reading the HK_ELI views…</p>
          } @else if (!insights().length) {
            <p class="ghost">No insights right now: the views didn't answer.</p>
          }
          <div class="cards">
            @for (i of insights(); track i.id) {
              <article class="card" [class.watch]="i.level === 'watch'">
                <span class="kind">{{ i.kind }}</span>
                <h4 class="c-title">{{ i.title }}</h4>
                <p class="c-fig">{{ i.figure }}</p>
                <div class="bar" aria-hidden="true"><span [style.width.%]="i.sharePct"></span></div>
                <p class="c-detail">{{ i.detail }}</p>
                <div class="c-foot">
                  <span class="src" [title]="'Worked out from the ' + i.source + ' Tableau view'">{{ i.source }}</span>
                  @if (i.tableauUrl) {<a [href]="i.tableauUrl" target="_blank" rel="noopener">Tableau ↗</a>}
                  <button type="button" class="eli-link more" (click)="ask(i.askMore)">Ask more</button>
                </div>
              </article>
            }
          </div>
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
    .insights { display: flex; flex-direction: column; gap: var(--eli-space-5); margin-top: var(--eli-space-7); }
    .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--eli-space-6); }
    @container widget (max-width: 900px) { .cards { grid-template-columns: 1fr; } }
    .card { display: flex; flex-direction: column; gap: var(--eli-space-3); padding: var(--eli-space-6) var(--eli-space-7); border: 1px solid var(--eli-separator); border-left: 3px solid var(--eli-accent-link); border-radius: var(--eli-radius-m); background: var(--eli-bg-dock); }
    .card.watch { border-left-color: var(--eli-accent-orange); }
    .kind { color: var(--eli-accent-link); font-size: var(--eli-font-size-xs); font-weight: var(--eli-weight-semibold); letter-spacing: 0.06em; text-transform: uppercase; }
    .watch .kind { color: var(--eli-accent-orange); }
    .c-title { margin: 0; color: var(--eli-text-strong); font-size: var(--eli-font-size-m); line-height: var(--eli-line-height-m); font-weight: var(--eli-weight-semibold); }
    .c-fig { margin: 0; color: var(--eli-text-strong); font-size: 22px; line-height: 28px; font-weight: var(--eli-weight-semibold); font-variant-numeric: tabular-nums; }
    .bar { height: 4px; border-radius: 2px; background: var(--eli-bg-canvas); overflow: hidden; span { display: block; height: 100%; background: var(--eli-accent-link); } }
    .watch .bar span { background: var(--eli-accent-orange); }
    .c-detail { margin: 0; color: var(--eli-text-muted-2); font-size: var(--eli-font-size-s); line-height: var(--eli-line-height-s); }
    .c-foot { display: flex; align-items: center; gap: var(--eli-space-5); margin-top: auto; padding-top: var(--eli-space-3); font-size: var(--eli-font-size-xs);
      a { color: var(--eli-accent-link); text-decoration: none; } .more { margin-left: auto; font-size: var(--eli-font-size-s); } }
    .src { color: var(--eli-text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ins-title { margin: 0; color: var(--eli-text-muted-2); font-size: var(--eli-font-size-xs); font-weight: var(--eli-weight-semibold); letter-spacing: 0.06em; text-transform: uppercase; }
    .ghost { color: var(--eli-text-muted); font-weight: var(--eli-weight-regular); }
    .brief { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; border-top: 1px solid var(--eli-separator); }
    .line { display: flex; align-items: flex-start; gap: var(--eli-space-6); width: 100%; padding: var(--eli-space-6) var(--eli-space-2); border: 0; border-bottom: 1px solid var(--eli-separator); background: none; color: var(--eli-text-primary); font: inherit; font-size: var(--eli-font-size-m); line-height: var(--eli-line-height-l); text-align: left; cursor: pointer;
      &:hover { background: var(--eli-bg-row); .go { opacity: 1; } } }
    .b-icon { flex: none; width: 16px; height: 16px; margin-top: 3px; color: var(--eli-accent-orange); }
    .b-text { flex: 1; }
    .go { flex: none; width: 16px; height: 16px; margin-top: 3px; color: var(--eli-accent-link); opacity: 0.4; }
    .ask { display: flex; align-items: flex-end; gap: var(--eli-space-4); padding: var(--eli-space-3) var(--eli-space-3) var(--eli-space-3) var(--eli-space-7); border: 1px solid var(--eli-border); border-radius: var(--eli-radius-m); background: var(--eli-bg-input);
      &:focus-within { border-color: var(--eli-focus-ring); } }
    .ask textarea { flex: 1; min-width: 0; min-height: 78px; max-height: 208px; padding: var(--eli-space-5) 0; border: 0; outline: 0; resize: none; overflow-y: auto; background: none; color: var(--eli-text-primary); font: inherit; font-size: var(--eli-font-size-l); line-height: 26px; }
    .hint { margin: calc(-1 * var(--eli-space-5)) 0 0; color: var(--eli-text-muted); font-size: var(--eli-font-size-xs); }
    .send { flex: none; margin-bottom: var(--eli-space-2); display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 50%; background: var(--eli-accent-blue); color: #fff; cursor: pointer;
      &:disabled { background: var(--eli-bg-row); color: var(--eli-text-muted); cursor: default; } mat-icon { width: 16px; height: 16px; } }
    .chips { display: flex; flex-wrap: wrap; gap: var(--eli-space-4); }
    .chip { display: inline-flex; align-items: center; gap: var(--eli-space-3); height: 30px; padding: 0 var(--eli-space-6); border: 1px solid var(--eli-border); border-radius: 15px; background: var(--eli-bg-dock); color: var(--eli-text-primary); font: inherit; font-size: var(--eli-font-size-s); cursor: pointer;
      &:hover { border-color: var(--eli-accent-link); color: var(--eli-text-strong); } mat-icon { width: 13px; height: 13px; color: var(--eli-accent-link); } }
    .chip.lib { border-style: dashed; color: var(--eli-text-muted-2); }
    .asof { display: flex; align-items: center; gap: var(--eli-space-3); margin: 0; color: var(--eli-text-muted); font-size: var(--eli-font-size-s); mat-icon { width: 14px; height: 14px; } }
  `,
})
export class BookPage {
  private readonly data = inject(ChatDataSource);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly session = inject(SessionService);
  private readonly clock = inject(BusinessClock);

  protected readonly chips = computed(() => CHIPS[this.session.role()]);
  protected readonly draft = signal('');
  protected readonly lines = signal<readonly Line[]>(INSIGHTS.map((q) => ({ q, status: 'loading' })));

  protected readonly greeting = computed(() => {
    const hour = this.clock.hour();
    const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return `${part}, ${this.session.user().firstName}`;
  });

  protected readonly loading = computed(() => this.lines().some((l) => l.status === 'loading'));

  /** Worked out by code from the view rows behind the answers: never written by the model. */
  protected readonly insights = computed<readonly Insight[]>(() => {
    if (this.loading()) return [];
    const a = (id: string) => this.lines().find((l) => l.q.id === id)?.answer;
    return [concentration(a('wps'), bookTotal(a('outstanding'))), peakDay(a('calendar')), hotspot(a('branches')), outcomeMix(a('calendar'))].filter(
      (x): x is Insight => x !== null,
    );
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

  /** The ask box grows with the question, from 3 lines up to 8, then scrolls. */
  protected grow(box: HTMLTextAreaElement): void {
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 208)}px`;
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.ask(this.draft());
    }
  }

  protected openLibrary(): void {
    this.dialog
      .open<PromptLibraryDialog, unknown, LibraryChoice>(PromptLibraryDialog, { panelClass: 'eli-library-panel', autoFocus: 'input' })
      .afterClosed()
      .subscribe((c) => {
        if (!c) return;
        if (c.action === 'ask') this.ask(c.question);
        else this.draft.set(c.question);
      });
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
