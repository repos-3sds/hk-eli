import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ChatAnswer } from '../../core/chat/chat.models';
import { AnswerChart } from './answer-chart';
import { AnswerEvidence, AnswerNotices } from './answer-evidence';
import { AnswerText } from './answer-text';
import { ScenarioCard } from './scenario-card';
import { TableauViews } from './tableau-views';

/** One answer: typed blocks (text, facts, client rows, bars, ideas, bullets), the trust line and follow-up questions. */
@Component({
  selector: 'eli-answer-card',
  imports: [NgTemplateOutlet, MatButtonModule, MatIconModule, AnswerChart, AnswerNotices, AnswerEvidence, AnswerText, ScenarioCard, TableauViews],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card" [class.fallback]="answer().fallback">
      @if (answer().status || answer().scope || answer().tableauUrl) {
        <div class="top">
          @if (answer().status; as st) {<span class="outcome" [class]="'outcome ' + outcomeClass(st)">{{ outcomeLabel(st) }}</span>}
          @if (answer().intent; as i) {<span class="scope">{{ i.replaceAll('_', ' ') }}</span>}
          @if (answer().scope) {<span class="scope">{{ answer().scope }}</span>}
          @if (answer().tableauUrl) {
            <a class="tab-link" [href]="answer().tableauUrl" target="_blank" rel="noopener" title="The same Tableau view with the same filters">Open in Tableau<mat-icon svgIcon="external-link" aria-hidden="true" /></a>
          }
        </div>
      }
      @if (answer().understood?.length) {
        <div class="read-as" role="group" aria-label="Read as">
          <span class="read-label">Read as</span>
          @for (u of answer().understood; track $index) {
            <span class="term" [class.gap]="u.gap" [attr.title]="u.gap ? 'In the catalog, but no published view carries it' : null">
              {{ u.label }}@if (u.value) {<b>{{ u.value }}</b>}@if (u.gap) {<em>not in any view</em>}
            </span>
          }
        </div>
      }
      <ng-template #blk let-b let-first="first">
        @switch (b.kind) {
          @case ('text') {
            @if (answer().figures?.length) {
              <eli-answer-text [text]="b.text" [figures]="answer().figures!" />
            } @else {
              <p class="text">{{ b.text }}</p>
            }
            @if (first && answer().clarify; as c) {
              @if (c.kind === 'reading') {
                <div class="readings" role="group" aria-label="Did you mean">
                  <span class="pick-label">Did you mean</span>
                  @for (o of c.options; track o.label) {
                    <button type="button" class="reading-btn" [disabled]="!showFollowUps()" (click)="followUp.emit(o.question)">
                      <span class="reading-label">{{ o.label }}</span>
                      <span class="reading-q">{{ o.question }}</span>
                    </button>
                  }
                </div>
              } @else {
                <div class="pick" role="group" [attr.aria-label]="'Pick a ' + c.label">
                  <span class="pick-label">{{ c.kind === 'ambiguous' ? 'Pick a ' + c.label : c.label === 'district' ? 'Districts' : 'Options' }}</span>
                  @for (o of c.options; track o.label) {
                    <button type="button" class="pick-btn" [disabled]="!showFollowUps()" [attr.title]="o.question" (click)="followUp.emit(o.question)">{{ o.label }}</button>
                  }
                </div>
              }
            }
          }
          @case ('table') {
            <section class="block">
              <h4 class="block-title">{{ b.title }}</h4>
              <div class="table-wrap">
                <table class="table">
                  <thead><tr>@for (c of b.columns; track $index) {<th scope="col" [class.num]="b.numeric.includes($index)">{{ c }}</th>}</tr></thead>
                  <tbody>
                    @for (r of b.rows; track $index; let ri = $index) {
                      <tr [class.flag]="b.flagged?.includes(ri)">
                        @for (cell of r; track $index) {<td [class.num]="b.numeric.includes($index)">{{ cell }}</td>}
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (b.flagged?.length) {<p class="table-note"><span class="flag-mark" aria-hidden="true"></span>Below the baseline</p>}
            </section>
          }
          @case ('chart') {
            <eli-answer-chart [spec]="b.spec" />
          }
          @case ('scenario') {
            <!-- A what-if keeps its words and slider on top and puts everything else in tabs, not one long scroll -->
            <eli-scenario-card [spec]="b.spec" [viewCount]="liveViews()" [hasDetails]="details().length > 0" (level)="move.set($event)">
              @if (views(); as v) {
                <eli-tableau-views scViews [embeds]="v.embeds" [move]="scenarioMove()" [ticker]="scenarioTicker()" [tabbed]="true" />
              }
              <div scDetails class="details">
                @for (d of details(); track $index) {<ng-container *ngTemplateOutlet="blk; context: { $implicit: d, first: false }" />}
              </div>
            </eli-scenario-card>
          }
          @case ('views') {
            <eli-tableau-views [embeds]="b.embeds" [move]="scenarioMove()" [ticker]="scenarioTicker()" />
          }
          @case ('notices') {
            <eli-answer-notices [block]="b" />
          }
          @case ('evidence') {
            <eli-answer-evidence [block]="b" [figures]="answer().figures ?? []" [model]="answer().model" [latencyMs]="answer().latencyMs" [tableauUrl]="answer().tableauUrl" />
          }
          @case ('bullets') {
            <section class="block">
              <h4 class="block-title">{{ b.title }}</h4>
              <ul class="bullets">
                @for (item of b.items; track item) {
                  <li>{{ item }}</li>
                }
              </ul>
            </section>
          }
        }
      </ng-template>
      @for (b of shown(); track $index) {
        <ng-container *ngTemplateOutlet="blk; context: { $implicit: b, first: $first }" />
      }
      @if (answer().writtenBy; as w) {<p class="asof"><mat-icon svgIcon="sparkles" aria-hidden="true" />{{ w }}</p>}
      @if (answer().refreshedAt) {
        <p class="asof"><mat-icon svgIcon="info" aria-hidden="true" />Data as of {{ answer().businessDate }} · refreshed {{ refreshed() }} · {{ answer().sources.join(', ') }} · Figures from Tableau, checked before writing · Internal use only</p>
      } @else if (!answer().fallback && answer().sources.length) {
        <p class="asof"><mat-icon svgIcon="info" aria-hidden="true" />Data as of {{ answer().businessDate }} · {{ answer().sources.join(', ') }} · Figures from Tableau, checked before writing · Internal use only</p>
      }
      @if (showFollowUps() && answer().followUps.length && !answer().clarify) {
        <div class="follow" role="group" aria-label="Ask next">
          <span class="follow-label">Ask next</span>
          @for (q of answer().followUps; track q) {
            <button type="button" class="chip" (click)="followUp.emit(q)"><mat-icon svgIcon="sparkles" aria-hidden="true" />{{ q }}</button>
          }
        </div>
      }
    </article>
  `,
  styles: `
    .top { display: flex; flex-wrap: wrap; align-items: center; gap: var(--eli-space-4); }
    .outcome { padding: 2px var(--eli-space-5); border-radius: var(--eli-radius-pill); font-size: var(--eli-font-size-xs); font-weight: var(--eli-weight-semibold);
      &.ok { background: rgb(43 159 135 / 18%); color: var(--eli-status-positive-text); } &.warn { background: rgb(255 147 46 / 16%); color: var(--eli-accent-orange); }
      &.info { background: rgb(99 171 255 / 14%); color: var(--eli-accent-link); } &.bad { background: rgb(255 51 51 / 14%); color: var(--eli-status-negative-text); } }
    .scope { padding: 2px var(--eli-space-5); border-radius: var(--eli-radius-pill); background: var(--eli-bg-row); color: var(--eli-text-muted-2); font-size: var(--eli-font-size-xs); }
    .tab-link { display: inline-flex; align-items: center; gap: var(--eli-space-2); margin-left: auto; color: var(--eli-accent-link); font-size: var(--eli-font-size-s); text-decoration: none; &:hover { text-decoration: underline; } mat-icon { width: 13px; height: 13px; } }
    .asof { display: flex; align-items: center; gap: var(--eli-space-3); margin: 0; color: var(--eli-text-muted); font-size: var(--eli-font-size-s); mat-icon { flex: none; width: 14px; height: 14px; } }
    .card { display: flex; flex-direction: column; gap: var(--eli-space-7); padding: var(--eli-space-7) var(--eli-space-8); border: 1px solid var(--eli-separator); border-radius: var(--eli-radius-m); background: var(--eli-bg-dock); }
    .card.fallback { border-left: 3px solid var(--eli-accent-link); }
    .text { margin: 0; color: var(--eli-text-primary); font-size: var(--eli-font-size-m); line-height: 22px; }
    .block { display: flex; flex-direction: column; gap: var(--eli-space-5); padding-top: var(--eli-space-6); border-top: 1px solid var(--eli-separator); }
    .block-title { margin: 0; color: var(--eli-text-muted-2); font-size: var(--eli-font-size-xs); font-weight: var(--eli-weight-semibold); letter-spacing: 0.06em; text-transform: uppercase; }
    .details { display: flex; flex-direction: column; gap: var(--eli-space-7); }
    .bullets { margin: 0; padding: 0; list-style: none; }
    .bullets { display: flex; flex-direction: column; gap: var(--eli-space-4); padding-left: var(--eli-space-7); list-style: disc; color: var(--eli-text-primary); }
    .table-wrap { overflow-x: auto; }
    .table { width: 100%; border-collapse: collapse; font-size: var(--eli-font-size-s); font-variant-numeric: tabular-nums; }
    .table th { padding: var(--eli-space-3) var(--eli-space-4); border-bottom: 1px solid var(--eli-border); color: var(--eli-text-muted); font-weight: var(--eli-weight-semibold); text-align: left; white-space: nowrap; }
    .table td { padding: var(--eli-space-4); border-bottom: 1px solid var(--eli-separator); color: var(--eli-text-primary); }
    .table .num { text-align: right; }
    .table tr.flag td:first-child { box-shadow: inset 3px 0 0 var(--eli-accent-orange); }
    .table tr.flag td { color: var(--eli-text-strong); }
    .table-note { display: flex; align-items: center; gap: var(--eli-space-3); margin: 0; color: var(--eli-text-muted); font-size: var(--eli-font-size-s); }
    .flag-mark { width: 3px; height: 12px; background: var(--eli-accent-orange); }
    .read-as { display: flex; flex-wrap: wrap; align-items: center; gap: var(--eli-space-3); margin-top: calc(-1 * var(--eli-space-3)); }
    .read-label { margin-right: var(--eli-space-2); color: var(--eli-text-muted); font-size: var(--eli-font-size-xs); }
    .term { display: inline-flex; align-items: baseline; gap: var(--eli-space-2); padding: 1px var(--eli-space-4); border: 1px solid var(--eli-separator); border-radius: var(--eli-radius-s); color: var(--eli-text-muted-2); font-size: var(--eli-font-size-xs);
      b { color: var(--eli-text-strong); font-weight: var(--eli-weight-semibold); }
      em { color: var(--eli-accent-orange); font-style: normal; }
      &.gap { border-color: rgb(255 147 46 / 45%); } }
    .pick { display: flex; flex-wrap: wrap; align-items: center; gap: var(--eli-space-4); }
    .pick-label { margin-right: var(--eli-space-2); color: var(--eli-text-muted); font-size: var(--eli-font-size-s); }
    .readings { display: flex; flex-direction: column; align-items: stretch; gap: var(--eli-space-3); max-width: 560px; }
    .reading-btn { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: var(--eli-space-4) var(--eli-space-6);
      border: 1px solid var(--eli-accent-link); border-radius: var(--eli-radius-s); background: rgb(99 171 255 / 8%);
      color: var(--eli-text-strong); font: inherit; text-align: left; cursor: pointer; }
    .reading-btn:hover:not(:disabled) { background: rgb(99 171 255 / 16%); }
    .reading-btn:focus-visible { outline: 2px solid var(--eli-accent-link); outline-offset: 2px; }
    .reading-btn:disabled { opacity: 0.55; cursor: default; }
    .reading-label { font-size: var(--eli-font-size-s); font-weight: var(--eli-weight-semibold); }
    .reading-q { color: var(--eli-text-muted); font-size: var(--eli-font-size-xs); }
    .pick-btn { height: 32px; padding: 0 var(--eli-space-7); border: 1px solid var(--eli-accent-link); border-radius: var(--eli-radius-s); background: rgb(99 171 255 / 10%); color: var(--eli-text-strong); font: inherit; font-size: var(--eli-font-size-s); font-weight: var(--eli-weight-semibold); cursor: pointer;
      &:hover:not(:disabled) { background: rgb(99 171 255 / 20%); } &:focus-visible { outline: 2px solid var(--eli-accent-link); outline-offset: 2px; } &:disabled { opacity: 0.55; cursor: default; } }
    .follow { display: flex; flex-wrap: wrap; align-items: center; gap: var(--eli-space-4); padding-top: var(--eli-space-6); border-top: 1px solid var(--eli-separator); }
    .follow-label { margin-right: var(--eli-space-2); color: var(--eli-text-muted); font-size: var(--eli-font-size-s); }
    .chip { display: inline-flex; align-items: center; gap: var(--eli-space-3); height: 28px; padding: 0 var(--eli-space-6); border: 1px solid var(--eli-border); border-radius: 14px; background: var(--eli-bg-dock); color: var(--eli-text-primary); font: inherit; font-size: var(--eli-font-size-s); cursor: pointer; &:hover { border-color: var(--eli-accent-link); color: var(--eli-text-strong); } mat-icon { width: 13px; height: 13px; color: var(--eli-accent-link); } }
  `,
})
export class AnswerCard {


  private static readonly OUTCOMES: Record<string, [string, string]> = {
    OK: ['Answered', 'ok'], OK_WITH_WARNING: ['Answered with caveats', 'warn'], OK_FALLBACK: ['Short answer', 'warn'], PARTIAL: ['Partial', 'warn'],
    NO_DATA: ['Nothing qualified', 'info'], NEEDS_CLARIFICATION: ['Needs clarification', 'info'], UNSUPPORTED: ["Can't answer from the views", 'bad'],
    VALIDATION_FAILED: ['Failed checks', 'bad'], SYSTEM_ERROR: ['Service unavailable', 'bad'],
  };
  protected outcomeLabel(s: string): string {
    return AnswerCard.OUTCOMES[s]?.[0] ?? s;
  }
  protected outcomeClass(s: string): string {
    return AnswerCard.OUTCOMES[s]?.[1] ?? 'info';
  }

  protected refreshed(): string {
    return (this.answer().refreshedAt ?? '').replace('T', ' ');
  }

  /** A what-if shows only its card at the top level; views and the detail blocks sit in the card's tabs. */
  private readonly hasScenario = computed(() => this.answer().blocks.some((b) => b.kind === 'scenario'));
  protected readonly shown = computed(() =>
    this.hasScenario() ? this.answer().blocks.filter((b) => b.kind === 'scenario') : this.answer().blocks,
  );
  protected readonly details = computed(() =>
    this.hasScenario() ? this.answer().blocks.filter((b) => b.kind !== 'scenario' && b.kind !== 'views') : [],
  );
  protected readonly views = computed(() => {
    const v = this.answer().blocks.find((b) => b.kind === 'views');
    return v && v.kind === 'views' ? v : null;
  });
  protected readonly liveViews = computed(() => this.views()?.embeds.filter((e) => !e.skipped).length ?? 0);

  /** The what-if slider's level once the user moves it; until then the views keep the asked level. */
  protected readonly move = signal<number | null>(null);
  protected scenarioMove(): number | null {
    const sc = this.answer().blocks.find((b) => b.kind === 'scenario');
    if (!sc || sc.kind !== 'scenario') return null;
    return this.move() ?? sc.spec.move;
  }
  protected scenarioTicker(): string | null {
    const sc = this.answer().blocks.find((b) => b.kind === 'scenario');
    return sc && sc.kind === 'scenario' ? sc.spec.ticker : null;
  }

  readonly answer = input.required<ChatAnswer>();
  /** Only the newest answer offers follow-up questions, so older ones stay quiet. */
  readonly showFollowUps = input(true);
  readonly followUp = output<string>();
}
