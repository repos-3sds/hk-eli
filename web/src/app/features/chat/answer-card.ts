import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ChatAnswer } from '../../core/chat/chat.models';
import { MomentChip } from '../today/shared/moment-chip';
import { ConcentrationBar } from '../today/shared/concentration-bar';
import { TrustLine } from '../today/shared/trust-line';
import { UsdPipe } from '../today/shared/format';

/** One answer: typed blocks (text, facts, client rows, bars, ideas, bullets), the trust line and follow-up questions. */
@Component({
  selector: 'eli-answer-card',
  imports: [MatButtonModule, MatIconModule, RouterLink, MomentChip, ConcentrationBar, TrustLine, UsdPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card" [class.fallback]="answer().fallback">
      <div class="who"><mat-icon svgIcon="sparkles" aria-hidden="true" />HK ELI Chatbot</div>
      @for (b of answer().blocks; track $index) {
        @switch (b.kind) {
          @case ('text') {
            <p class="text">{{ b.text }}</p>
          }
          @case ('facts') {
            <dl class="facts">
              @for (f of b.items; track f.label) {
                <div class="fact"><dt>{{ f.label }}</dt><dd>{{ f.value }}</dd></div>
              }
            </dl>
          }
          @case ('clients') {
            <section class="block">
              <h4 class="block-title">{{ b.title }}</h4>
              <ul class="rows">
                @for (r of b.rows; track r.clientId) {
                  <li class="row">
                    <span class="name">{{ r.name }}</span>
                    <eli-moment-chip [type]="r.type">{{ r.when }}</eli-moment-chip>
                    <span class="note">{{ r.note }}</span>
                    <span class="amt">{{ r.amountUsd ? (r.amountUsd | usd) : '' }}</span>
                    <button matButton type="button" class="ask" (click)="followUp.emit('Prepare me for my call with ' + r.name.split(' ')[0])">Prepare call</button>
                  </li>
                }
              </ul>
            </section>
          }
          @case ('concentration') {
            <section class="block">
              <h4 class="block-title">{{ b.title }}</h4>
              <div class="bars">
                @for (l of b.lines; track l.underlying) {
                  <eli-concentration-bar class="bar" [underlying]="l.underlying" [fromPct]="l.sharePct" [limitPct]="l.limitPct" />
                }
              </div>
            </section>
          }
          @case ('ideas') {
            <section class="block">
              <h4 class="block-title">{{ b.title }}</h4>
              <ol class="ideas">
                @for (i of b.ideas; track i.id; let n = $index) {
                  <li class="idea">
                    <span class="rank">{{ n + 1 }}</span>
                    <span class="idea-title">{{ i.title }}</span>
                    <span class="terms">{{ i.tenor }} · coupon {{ i.couponPct }}% · KI {{ i.kiPct }}%</span>
                    <span class="conc">{{ i.concentration }}</span>
                  </li>
                }
              </ol>
              <a matButton="outlined" class="open" [routerLink]="['/rm/today/ideas', b.clientId]">Open ideas and request a live quote</a>
            </section>
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
      }
      <eli-trust-line [businessDate]="answer().businessDate" [sources]="answer().sources" reference="chat" />
      @if (answer().followUps.length) {
        <div class="follow" aria-label="Ask next">
          @for (q of answer().followUps; track q) {
            <button type="button" class="chip" (click)="followUp.emit(q)">{{ q }}</button>
          }
        </div>
      }
    </article>
  `,
  styles: `
    .card { display: flex; flex-direction: column; gap: var(--eli-space-7); padding: var(--eli-space-7) var(--eli-space-8); border: 1px solid var(--eli-border); border-radius: var(--eli-radius-m); background: var(--eli-bg-canvas); }
    .who { display: flex; align-items: center; gap: var(--eli-space-3); color: var(--eli-accent-orange); font-size: var(--eli-font-size-s); font-weight: var(--eli-weight-semibold); text-transform: uppercase; letter-spacing: 0.04em; mat-icon { width: 14px; height: 14px; } }
    .text { margin: 0; color: var(--eli-text-primary); font-size: var(--eli-font-size-m); line-height: 22px; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--eli-space-4); margin: 0; }
    .fact { padding: var(--eli-space-5) var(--eli-space-6); border-radius: var(--eli-radius-s); background: var(--eli-bg-dock); dt { color: var(--eli-text-muted); font-size: var(--eli-font-size-s); } dd { margin: var(--eli-space-2) 0 0; color: var(--eli-text-strong); font-size: var(--eli-font-size-l); font-weight: var(--eli-weight-semibold); } }
    .block { display: flex; flex-direction: column; gap: var(--eli-space-5); padding-top: var(--eli-space-6); border-top: 1px solid var(--eli-border); }
    .block-title { margin: 0; color: var(--eli-text-strong); font-size: var(--eli-font-size-s); font-weight: var(--eli-weight-semibold); }
    .rows, .ideas, .bullets { margin: 0; padding: 0; list-style: none; }
    .row { display: grid; grid-template-columns: minmax(120px, 1fr) auto minmax(0, 1fr) 90px auto; gap: var(--eli-space-6); align-items: center; padding: var(--eli-space-4) 0; border-bottom: 1px solid var(--eli-border); &:last-child { border-bottom: 0; } }
    .name { color: var(--eli-text-strong); font-weight: var(--eli-weight-semibold); }
    .note { color: var(--eli-text-muted); font-size: var(--eli-font-size-s); }
    .amt { color: var(--eli-text-strong); text-align: right; font-variant-numeric: tabular-nums; }
    .bars { display: flex; flex-direction: column; gap: var(--eli-space-6); max-width: 420px; }
    .bar { max-width: none; }
    .idea { display: grid; grid-template-columns: 20px minmax(0, 1.4fr) auto auto; gap: var(--eli-space-6); align-items: baseline; padding: var(--eli-space-4) 0; border-bottom: 1px solid var(--eli-border); &:last-child { border-bottom: 0; } }
    .rank { color: var(--eli-accent-orange); font-weight: var(--eli-weight-semibold); }
    .idea-title { color: var(--eli-text-strong); font-weight: var(--eli-weight-semibold); }
    .terms, .conc { color: var(--eli-text-muted-2); font-size: var(--eli-font-size-s); font-variant-numeric: tabular-nums; }
    .open { align-self: flex-start; }
    .bullets { display: flex; flex-direction: column; gap: var(--eli-space-4); padding-left: var(--eli-space-7); list-style: disc; color: var(--eli-text-primary); }
    .follow { display: flex; flex-wrap: wrap; gap: var(--eli-space-4); }
    .chip { height: 28px; padding: 0 var(--eli-space-6); border: 1px solid var(--eli-border); border-radius: 14px; background: var(--eli-bg-dock); color: var(--eli-text-primary); font: inherit; font-size: var(--eli-font-size-s); cursor: pointer; &:hover { border-color: var(--eli-accent-link); color: var(--eli-text-strong); } }
  `,
})
export class AnswerCard {
  readonly answer = input.required<ChatAnswer>();
  readonly followUp = output<string>();
}
