import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { ChatDataSource } from '../../core/chat/chat-data-source';
import { ChartSpec, ChatAnswer } from '../../core/chat/chat.models';
import { DISCOVERY_QUESTIONS, DiscoveryQuestion } from '../../core/chat/discovery-questions';
import { AnswerChart } from '../chat/answer-chart';

type TileSize = 's' | 'm' | 'l';

interface TileDef {
  readonly q: DiscoveryQuestion;
  readonly size: TileSize;
}

interface TileState {
  readonly def: TileDef;
  readonly status: 'loading' | 'done' | 'error';
  readonly answer?: ChatAnswer;
}

const D = DISCOVERY_QUESTIONS;

/** Today's tiles, in reading order: the book, then where it is heading in the next 30 days, then the risk. */
const TILES: readonly TileDef[] = [
  { q: D.outstanding, size: 's' },
  { q: D.koShare, size: 's' },
  { q: D.koCustomers, size: 's' },
  { q: D.calendar, size: 'l' },
  { q: D.segments, size: 'm' },
  { q: D.branches, size: 'm' },
  { q: D.wps, size: 'm' },
  { q: D.districts, size: 'm' },
  { q: D.mtm, size: 'm' },
];

/**
 * Today: the ELI book at a glance. Each tile is the chat's own answer to the question on it, made by the Stork
 * pipeline from one of the 12 HK_ELI Tableau views, so Today and Chat can never disagree. Nothing here is a
 * fixture: when the pipeline can't answer, the tile says so.
 */
@Component({
  selector: 'eli-book-page',
  imports: [FormsModule, MatButtonModule, MatIconModule, AnswerChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page eli-scroll">
      <header class="head">
        <div>
          <h2 class="title">Today in the ELI book</h2>
          <p class="sub">
            @if (asOf(); as a) {<mat-icon svgIcon="info" aria-hidden="true" />{{ a }} · }
            Every tile is the chat's answer to the question on it, from the HK_ELI Tableau views.
          </p>
        </div>
        <form class="ask" (submit)="$event.preventDefault(); ask(draft())">
          <input type="text" name="q" [ngModel]="draft()" (ngModelChange)="draft.set($event)" placeholder="Ask about the ELI book" aria-label="Ask about the ELI book" />
          <button matButton="filled" type="submit" [disabled]="!draft().trim()"><mat-icon svgIcon="send" />Ask</button>
        </form>
      </header>

      <div class="grid">
        @for (t of tiles(); track t.def.q.id) {
          <section class="tile" [class]="'tile s-' + t.def.size" [attr.aria-label]="t.def.q.title">
            <div class="t-head">
              <mat-icon class="t-icon" [svgIcon]="t.def.q.icon" aria-hidden="true" />
              <h3 class="t-title">{{ t.def.q.title }}</h3>
              @if (t.answer?.scope; as scope) {<span class="scope">{{ scope }}</span>}
            </div>
            @switch (t.status) {
              @case ('loading') {
                <div class="loading" role="status"><span class="eli-spinner"></span>Asking the {{ t.def.q.view }} view</div>
              }
              @case ('error') {
                <p class="err"><mat-icon svgIcon="circle-alert" aria-hidden="true" />The pipeline didn't answer. Is it running?</p>
              }
              @case ('done') {
                @let a = t.answer!;
                @let chart = chartOf(a);
                @if (t.def.size === 's') {
                  <p class="big">{{ bigOf(a) }}</p>
                  <p class="text small">{{ a.blocks[0]?.kind === 'text' ? textOf(a) : '' }}</p>
                } @else {
                  <p class="text">{{ textOf(a) }}</p>
                  @if (chart) {<eli-answer-chart [spec]="chart" [compact]="true" [wide]="t.def.size === 'l'" />}
                }
              }
            }
            <div class="t-foot">
              <button type="button" class="eli-link q" (click)="ask(t.def.q.question)" [title]="'Ask in Chat: ' + t.def.q.question">“{{ t.def.q.question }}”</button>
              @if (t.answer?.tableauUrl; as url) {
                <a class="tab-link" [href]="url" target="_blank" rel="noopener">Open in Tableau<mat-icon svgIcon="external-link" aria-hidden="true" /></a>
              }
            </div>
          </section>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; height: 100%; }
    .page { height: 100%; overflow: auto; padding: var(--eli-space-6) var(--eli-space-7) var(--eli-space-8); box-sizing: border-box; }
    .head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--eli-space-7); margin-bottom: var(--eli-space-7); }
    .title { margin: 0; color: var(--eli-text-strong); font-size: var(--eli-font-size-xl); line-height: var(--eli-line-height-xl); font-weight: var(--eli-weight-semibold); }
    .sub { display: flex; align-items: center; gap: var(--eli-space-3); margin: var(--eli-space-2) 0 0; color: var(--eli-text-muted); font-size: var(--eli-font-size-s); mat-icon { width: 14px; height: 14px; flex: none; } }
    .ask { display: flex; gap: var(--eli-space-4); flex: 0 1 460px; min-width: 260px; }
    .ask input { flex: 1; min-width: 0; height: 36px; padding: 0 var(--eli-space-6); border: 1px solid var(--eli-border); border-radius: var(--eli-radius-s); background: var(--eli-bg-input); color: var(--eli-text-primary); font: inherit; font-size: var(--eli-font-size-m);
      &:focus { outline: 2px solid var(--eli-focus-ring); outline-offset: -1px; } }
    .grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--eli-widget-gap); }
    .tile { display: flex; flex-direction: column; gap: var(--eli-space-5); min-width: 0; padding: var(--eli-space-6) var(--eli-space-7); border: 1px solid var(--eli-separator); border-radius: var(--eli-radius-m); background: var(--eli-bg-dock); }
    .s-s { grid-column: span 2; } .s-m { grid-column: span 3; } .s-l { grid-column: span 6; }
    @container widget (max-width: 1080px) { .s-s { grid-column: span 3; } .s-m, .s-l { grid-column: span 6; } }
    .t-head { display: flex; align-items: center; gap: var(--eli-space-4); }
    .t-icon { width: 15px; height: 15px; color: var(--eli-accent-orange); flex: none; }
    .t-title { margin: 0; color: var(--eli-text-muted-2); font-size: var(--eli-font-size-xs); font-weight: var(--eli-weight-semibold); letter-spacing: 0.06em; text-transform: uppercase; }
    .scope { margin-left: auto; padding: 1px var(--eli-space-4); border-radius: var(--eli-radius-pill); background: var(--eli-bg-row); color: var(--eli-text-muted-2); font-size: var(--eli-font-size-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 55%; }
    .big { margin: 0; color: var(--eli-text-strong); font-size: 26px; line-height: 32px; font-weight: var(--eli-weight-semibold); font-variant-numeric: tabular-nums; }
    .text { margin: 0; color: var(--eli-text-primary); font-size: var(--eli-font-size-m); line-height: var(--eli-line-height-l); }
    .text.small { color: var(--eli-text-muted); font-size: var(--eli-font-size-s); line-height: var(--eli-line-height-s); }
    .loading, .err { display: flex; align-items: center; gap: var(--eli-space-4); margin: 0; color: var(--eli-text-muted); font-size: var(--eli-font-size-s); mat-icon { width: 14px; height: 14px; color: var(--eli-accent-orange); } }
    .t-foot { display: flex; align-items: center; gap: var(--eli-space-6); margin-top: auto; padding-top: var(--eli-space-4); border-top: 1px solid var(--eli-separator); }
    .q { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--eli-font-size-s); text-align: left; }
    .tab-link { display: inline-flex; align-items: center; gap: var(--eli-space-2); margin-left: auto; flex: none; color: var(--eli-accent-link); font-size: var(--eli-font-size-s); text-decoration: none; &:hover { text-decoration: underline; } mat-icon { width: 13px; height: 13px; } }
  `,
})
export class BookPage {
  private readonly data = inject(ChatDataSource);
  private readonly router = inject(Router);

  protected readonly draft = signal('');
  protected readonly tiles = signal<readonly TileState[]>(TILES.map((def) => ({ def, status: 'loading' })));

  /** The data date, from the first tile that knows it. */
  protected readonly asOf = computed(() => {
    const a = this.tiles().find((t) => t.answer?.businessDate)?.answer;
    if (!a) return null;
    return `Data as of ${a.businessDate}${a.refreshedAt ? `, refreshed ${a.refreshedAt.replace('T', ' ')}` : ''}`;
  });

  constructor() {
    TILES.forEach((def, i) => {
      this.data.ask({ text: def.q.question, clientId: null }).subscribe({
        next: (answer) => this.set(i, { def, status: 'done', answer }),
        error: () => this.set(i, { def, status: 'error' }),
      });
    });
  }

  protected ask(question: string): void {
    const q = question.trim();
    if (q) void this.router.navigate(['/chat'], { queryParams: { q } });
  }

  protected textOf(a: ChatAnswer): string {
    const b = a.blocks[0];
    return b?.kind === 'text' ? b.text : '';
  }

  protected chartOf(a: ChatAnswer): ChartSpec | null {
    const b = a.blocks.find((x) => x.kind === 'chart');
    return b?.kind === 'chart' ? b.spec : null;
  }

  /** The headline figure for a small tile: a KPI value, else the first amount, share or count in the headline. */
  protected bigOf(a: ChatAnswer): string {
    const text = this.textOf(a);
    const m = /HKD [\d.,]+(bn|m|k)?|\d+(\.\d+)?%|^\d+/.exec(text);
    return m ? m[0] : '—';
  }

  private set(i: number, state: TileState): void {
    this.tiles.update((all) => all.map((t, n) => (n === i ? state : t)));
  }
}
