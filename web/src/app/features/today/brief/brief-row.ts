import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Lead } from '../../../core/models/today.models';
import { MomentChip } from '../shared/moment-chip';
import { callName, momentText } from '../shared/moment-text';

/**
 * One client in the morning brief, as a single scannable line: rank, who, when, why, how strong.
 * Pressing the row puts the client in the right-hand panel, where the actions are.
 * When the panel is hidden (narrow widget), the selected row shows the actions itself.
 */
@Component({
  selector: 'eli-brief-row',
  imports: [MatButtonModule, MatIconModule, RouterLink, MomentChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="item" [class.selected]="selected()" [class.panel-closed]="panelClosed()">
      <button type="button" class="row" [attr.aria-pressed]="selected()" [attr.aria-labelledby]="'lead-' + lead().id" (click)="pick.emit(lead())">
        <span class="rank" aria-hidden="true">{{ rank() }}</span>
        <span class="who">
          <span class="name" [id]="'lead-' + lead().id">{{ lead().clientName }}</span>
          <span class="meta">{{ lead().segment }} · CIF {{ lead().cifMasked }}</span>
        </span>
        <eli-moment-chip class="chip" [type]="lead().moment.type">{{ chip() }}</eli-moment-chip>
        <span class="why">{{ lead().summary }}</span>
        <span class="score" [attr.aria-label]="met() + ' of ' + lead().signals.length + ' signals agree'">
          <span class="dots" aria-hidden="true">
            @for (s of ordered(); track s.id) {
              <span class="dot" [class.on]="s.met"></span>
            }
          </span>
          <span class="count" aria-hidden="true">{{ met() }}/{{ lead().signals.length }}</span>
        </span>
        <mat-icon class="go" svgIcon="chevron-right" aria-hidden="true" />
      </button>
      @if (selected()) {
        <div class="inline-actions">
          <a matButton="filled" routerLink="/ideas" [queryParams]="{ client: lead().clientId }">{{ lead().action.label }}</a>
          <button matButton="outlined" type="button" (click)="ask.emit(lead())">Ask about {{ name() }}</button>
          <button matButton type="button" (click)="park.emit(lead())">Mark reviewed</button>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .item { border-left: 3px solid transparent; border-radius: var(--eli-radius-s); background: var(--eli-bg-surface); }
    .item.selected { border-left-color: var(--eli-accent-orange); background: var(--eli-bg-selected); }
    .row {
      display: grid; width: 100%; align-items: center; column-gap: var(--eli-space-6);
      grid-template-columns: 20px minmax(150px, 210px) auto minmax(0, 1fr) auto 16px;
      padding: var(--eli-space-5) var(--eli-space-6) var(--eli-space-5) var(--eli-space-5);
      border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer;
      border-radius: var(--eli-radius-s);
    }
    .item:not(.selected) .row:hover { background: var(--eli-bg-row); }
    .rank { color: var(--eli-text-muted); font-size: var(--eli-font-size-s); font-weight: var(--eli-weight-semibold); text-align: right; }
    .selected .rank { color: var(--eli-accent-orange); }
    .who { display: flex; flex-direction: column; min-width: 0; }
    .name { color: var(--eli-text-strong); font-weight: var(--eli-weight-semibold); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta { color: var(--eli-text-muted); font-size: var(--eli-font-size-s); line-height: var(--eli-line-height-s); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .why {
      min-width: 0; color: var(--eli-text-primary); font-size: var(--eli-font-size-s); line-height: var(--eli-line-height-s);
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .score { display: inline-flex; align-items: center; gap: var(--eli-space-3); color: var(--eli-text-muted-2); font-size: var(--eli-font-size-s); }
    .dots { display: inline-flex; gap: var(--eli-space-2); }
    .dot { width: 7px; height: 7px; border-radius: 50%; border: 1px solid var(--eli-text-muted-2); }
    .dot.on { border-color: var(--eli-accent-link); background: var(--eli-accent-link); }
    .count { min-width: 22px; color: var(--eli-text-strong); font-weight: var(--eli-weight-semibold); }
    .go { width: 16px; height: 16px; color: var(--eli-text-muted); }
    .selected .go { color: var(--eli-text-strong); }

    /* The actions live in the right-hand panel. Only when that panel is hidden do they show in the row. */
    .inline-actions { display: none; gap: var(--eli-space-4); flex-wrap: wrap; padding: 0 var(--eli-space-6) var(--eli-space-5) 42px; }
    .panel-closed .inline-actions { display: flex; }
    @container widget (max-width: 1080px) {
      .inline-actions { display: flex; }
      .row { grid-template-columns: 20px minmax(0, 1fr) auto 16px; row-gap: var(--eli-space-3); }
      .chip { grid-column: 2; grid-row: 2; justify-self: start; }
      .why { grid-column: 2 / 4; grid-row: 3; }
      .score { grid-column: 3; grid-row: 1; }
      .go { grid-column: 4; grid-row: 1; }
    }
  `,
})
export class BriefRow {
  readonly lead = input.required<Lead>();
  readonly rank = input.required<number>();
  readonly selected = input(false);
  /** The right-hand panel is closed, so the selected row carries the actions. */
  readonly panelClosed = input(false);
  readonly pick = output<Lead>();
  readonly ask = output<Lead>();
  readonly park = output<Lead>();

  protected readonly chip = computed(() => momentText(this.lead().moment));
  protected readonly name = computed(() => callName(this.lead().clientName));
  protected readonly met = computed(() => this.lead().signals.filter((s) => s.met).length);
  protected readonly ordered = computed(() => [...this.lead().signals].sort((a, b) => Number(b.met) - Number(a.met)));
}
