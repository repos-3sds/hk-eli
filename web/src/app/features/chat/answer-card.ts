import { TableauParity, parityLine } from '../../core/parity/tableau-parity';
import { shortDate } from '../../core/time/business-calendar';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ChatAnswer, EvidenceRecord } from '../../core/chat/chat.models';
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
      @if (answer().sourceMode; as mode) {
        <div class="origin">
          <span class="mode" [class.mock]="mode.includes('MOCK')">{{ mode.includes('MOCK') ? 'Demo data · not live' : 'Live data' }}</span>
          <span class="origin-text">Answered by the HK ELI skills service</span>
        </div>
      }
      @if (answer().status === 'partial') {
        <p class="partial" role="note"><mat-icon svgIcon="triangle-alert" aria-hidden="true" />Partial answer: some parts were not available. See the notes below.</p>
      }
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
                    <button matButton type="button" class="ask" (click)="followUp.emit('Brief me on ' + r.name.split(' ')[0])">Brief me</button>
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
              <a matButton="outlined" class="open" routerLink="/ideas" [queryParams]="{ client: b.clientId }">See why in Ideas<mat-icon svgIcon="chevron-right" iconPositionEnd /></a>
            </section>
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
      @if (answer().limitations?.length) {
        <section class="notes" aria-label="What this answer does not cover">
          <h4 class="block-title">Notes</h4>
          <ul>
            @for (l of answer().limitations; track l) {<li>{{ l }}</li>}
          </ul>
        </section>
      }
      @if (answer().evidence?.length) {
        <details class="evidence">
          <summary><mat-icon svgIcon="chevron-right" aria-hidden="true" />Evidence behind these figures ({{ answer().evidence!.length }})</summary>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th scope="col">Figure</th><th scope="col" class="num">Value</th><th scope="col">As of</th><th scope="col">Source</th></tr></thead>
              <tbody>
                @for (e of answer().evidence; track e.id) {
                  <tr>
                    <td>{{ e.label }}</td>
                    <td class="num">{{ evidenceValue(e) }}</td>
                    <td>{{ e.asOf }}</td>
                    <td class="src">{{ e.sourceMode }} · {{ e.source }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </details>
      }
      @if (!answer().fallback) {
        <eli-trust-line [businessDate]="answer().businessDate" [sources]="answer().sources" reference="chat" />
      }
      @if (answer().parity; as p) {
        <p class="parity" [class]="p.status" [attr.role]="p.status === 'mismatch' ? 'note' : null">
          <mat-icon [svgIcon]="p.status === 'match' ? 'check' : p.status === 'mismatch' ? 'triangle-alert' : 'info'" aria-hidden="true" />
          <span>{{ parityText(p) }}</span>
        </p>
      }
      @if (showFollowUps() && answer().followUps.length) {
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
    .parity { display: flex; align-items: flex-start; gap: var(--eli-space-3); margin: 0; color: var(--eli-text-muted-2); font-size: var(--eli-font-size-s);
      mat-icon { flex: none; width: 14px; height: 14px; margin-top: 2px; }
      &.match mat-icon { color: var(--eli-status-positive-text); }
      &.mismatch { padding: var(--eli-space-3) var(--eli-space-5); border-left: 3px solid var(--eli-accent-orange); border-radius: var(--eli-radius-s); background: var(--eli-bg-row); color: var(--eli-text-primary); mat-icon { color: var(--eli-accent-orange); } }
      &.unchecked { color: var(--eli-text-muted); } }
    .origin { display: flex; align-items: center; gap: var(--eli-space-5); flex-wrap: wrap; }
    .mode { display: inline-flex; align-items: center; height: 22px; padding: 0 var(--eli-space-5); border: 1px solid var(--eli-status-positive); border-radius: var(--eli-radius-pill); color: var(--eli-status-positive-text); font-size: var(--eli-font-size-xs); font-weight: var(--eli-weight-semibold); letter-spacing: 0.02em;
      &.mock { border-color: var(--eli-accent-orange); color: var(--eli-accent-orange); } }
    .origin-text { color: var(--eli-text-muted); font-size: var(--eli-font-size-s); }
    .partial { display: flex; align-items: center; gap: var(--eli-space-3); margin: 0; padding: var(--eli-space-3) var(--eli-space-5); border-left: 3px solid var(--eli-accent-orange); border-radius: var(--eli-radius-s); background: var(--eli-bg-row); color: var(--eli-text-primary); font-size: var(--eli-font-size-s);
      mat-icon { width: 14px; height: 14px; color: var(--eli-accent-orange); } }
    .notes { display: flex; flex-direction: column; gap: var(--eli-space-3); padding-top: var(--eli-space-6); border-top: 1px solid var(--eli-separator);
      ul { display: flex; flex-direction: column; gap: var(--eli-space-2); margin: 0; padding-left: var(--eli-space-7); color: var(--eli-text-muted-2); font-size: var(--eli-font-size-s); line-height: 18px; } }
    .evidence { border-top: 1px solid var(--eli-separator); padding-top: var(--eli-space-5);
      summary { display: inline-flex; align-items: center; gap: var(--eli-space-3); color: var(--eli-accent-link); font-size: var(--eli-font-size-s); cursor: pointer; list-style: none; border-radius: var(--eli-radius-s);
        &::-webkit-details-marker { display: none; }
        &:focus-visible { outline: 2px solid var(--eli-focus-ring); outline-offset: 2px; }
        mat-icon { width: 14px; height: 14px; transition: transform var(--eli-motion-fast); } }
      &[open] summary mat-icon { transform: rotate(90deg); }
      .table-wrap { max-height: 260px; overflow: auto; margin-top: var(--eli-space-4); }
      .src { color: var(--eli-text-muted); white-space: nowrap; } }
    .card { display: flex; flex-direction: column; gap: var(--eli-space-7); padding: var(--eli-space-7) var(--eli-space-8); border: 1px solid var(--eli-separator); border-radius: var(--eli-radius-m); background: var(--eli-bg-dock); }
    .card.fallback { border-left: 3px solid var(--eli-accent-link); }
    .text { margin: 0; color: var(--eli-text-primary); font-size: var(--eli-font-size-m); line-height: 22px; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--eli-space-4); margin: 0; }
    .fact { padding: var(--eli-space-5) var(--eli-space-6); border-radius: var(--eli-radius-s); background: var(--eli-bg-canvas); dt { color: var(--eli-text-muted); font-size: var(--eli-font-size-s); } dd { margin: var(--eli-space-2) 0 0; color: var(--eli-text-strong); font-size: var(--eli-font-size-l); font-weight: var(--eli-weight-semibold); } }
    .block { display: flex; flex-direction: column; gap: var(--eli-space-5); padding-top: var(--eli-space-6); border-top: 1px solid var(--eli-separator); }
    .block-title { margin: 0; color: var(--eli-text-muted-2); font-size: var(--eli-font-size-xs); font-weight: var(--eli-weight-semibold); letter-spacing: 0.06em; text-transform: uppercase; }
    .rows, .ideas, .bullets { margin: 0; padding: 0; list-style: none; }
    .row { display: grid; grid-template-columns: minmax(120px, 1fr) auto minmax(0, 1fr) 90px auto; gap: var(--eli-space-6); align-items: center; padding: var(--eli-space-4) 0; border-bottom: 1px solid var(--eli-separator); &:last-child { border-bottom: 0; } }
    .name { color: var(--eli-text-strong); font-weight: var(--eli-weight-semibold); }
    .note { color: var(--eli-text-muted); font-size: var(--eli-font-size-s); }
    .amt { color: var(--eli-text-strong); text-align: right; font-variant-numeric: tabular-nums; }
    .bars { display: flex; flex-direction: column; gap: var(--eli-space-6); max-width: 420px; }
    .bar { max-width: none; }
    .idea { display: grid; grid-template-columns: 20px minmax(0, 1.4fr) auto auto; gap: var(--eli-space-6); align-items: baseline; padding: var(--eli-space-4) 0; border-bottom: 1px solid var(--eli-separator); &:last-child { border-bottom: 0; } }
    .rank { color: var(--eli-accent-orange); font-weight: var(--eli-weight-semibold); }
    .idea-title { color: var(--eli-text-strong); font-weight: var(--eli-weight-semibold); }
    .terms, .conc { color: var(--eli-text-muted-2); font-size: var(--eli-font-size-s); font-variant-numeric: tabular-nums; }
    .open { align-self: flex-start; }
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
    .follow { display: flex; flex-wrap: wrap; align-items: center; gap: var(--eli-space-4); padding-top: var(--eli-space-6); border-top: 1px solid var(--eli-separator); }
    .follow-label { margin-right: var(--eli-space-2); color: var(--eli-text-muted); font-size: var(--eli-font-size-s); }
    .chip { display: inline-flex; align-items: center; gap: var(--eli-space-3); height: 28px; padding: 0 var(--eli-space-6); border: 1px solid var(--eli-border); border-radius: 14px; background: var(--eli-bg-dock); color: var(--eli-text-primary); font: inherit; font-size: var(--eli-font-size-s); cursor: pointer; &:hover { border-color: var(--eli-accent-link); color: var(--eli-text-strong); } mat-icon { width: 13px; height: 13px; color: var(--eli-accent-link); } }
  `,
})
export class AnswerCard {
  protected parityText(p: TableauParity): string {
    return parityLine(p, shortDate(this.answer().businessDate));
  }

  /** "USD 147.78m" for amounts, "24.63%" for ratios, the plain value otherwise. */
  protected evidenceValue(e: EvidenceRecord): string {
    if (e.value === null) return '–';
    const n = Number(e.value);
    if (Number.isNaN(n)) return e.value;
    if (e.unit === 'USD') return n >= 1_000_000 ? `USD ${(n / 1_000_000).toFixed(2)}m` : `USD ${Math.round(n / 1000)}k`;
    if (e.unit === 'ratio') return `${(n * 100).toFixed(2)}%`;
    if (e.unit === 'percentage_points') return `${n.toFixed(1)}%`;
    return n.toLocaleString('en-US');
  }

  readonly answer = input.required<ChatAnswer>();
  /** Only the newest answer offers follow-up questions, so older ones stay quiet. */
  readonly showFollowUps = input(true);
  readonly followUp = output<string>();
}
