import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { Lead } from '../../../core/models/today.models';
import { AgreementDots } from '../shared/agreement-dots';
import { MomentChip } from '../shared/moment-chip';
import { callName, momentText } from '../shared/moment-text';

/** One client in the morning brief: why today, how many signals agree, and what to do next. */
@Component({
  selector: 'eli-lead-card',
  imports: [MatButtonModule, RouterLink, AgreementDots, MomentChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card" [class.current]="current()" [attr.aria-labelledby]="'lead-' + lead().id">
      <div class="top">
        <h3 class="name" [id]="'lead-' + lead().id">
          <button type="button" class="name-btn" (click)="pick.emit(lead())" [attr.aria-label]="'Show ' + lead().clientName + ' in the client panel'">{{ lead().clientName }}</button>
        </h3>
        <span class="meta">{{ lead().segment }} · CIF {{ lead().cifMasked }}</span>
        <eli-moment-chip [type]="lead().moment.type">{{ chip() }}</eli-moment-chip>
        <span class="grow"></span>
        <eli-agreement-dots [signals]="lead().signals" />
      </div>
      <p class="summary">{{ lead().summary }}</p>
      <div class="actions">
        <a matButton="filled" [routerLink]="['ideas', lead().clientId]" (click)="pick.emit(lead())">{{ lead().action.label }}</a>
        <button matButton="outlined" type="button" (click)="ask.emit(lead())">Ask about {{ name() }}</button>
        <button matButton type="button" (click)="park.emit(lead())">Not today</button>
      </div>
    </article>
  `,
  styles: `
    .card {
      display: flex; flex-direction: column; gap: var(--eli-space-4); padding: var(--eli-space-6) var(--eli-space-7);
      border: 1px solid transparent; border-radius: var(--eli-radius-s); background: var(--eli-bg-surface);
    }
    .card.current { border-color: var(--eli-border); }
    .top { display: flex; align-items: center; gap: var(--eli-space-6); flex-wrap: wrap; }
    .name { margin: 0; font-size: var(--eli-font-size-l); line-height: var(--eli-line-height-l); font-weight: var(--eli-weight-semibold); }
    .name-btn { padding: 0; border: 0; background: none; color: var(--eli-text-strong); font: inherit; cursor: pointer; &:hover { text-decoration: underline; } }
    .meta { color: var(--eli-text-muted); font-size: var(--eli-font-size-s); }
    .grow { flex: 1; }
    .summary { margin: 0; color: var(--eli-text-primary); font-size: var(--eli-font-size-m); line-height: var(--eli-line-height-m); max-width: 1100px; }
    .actions { display: flex; align-items: center; gap: var(--eli-space-4); flex-wrap: wrap; }
  `,
})
export class LeadCard {
  readonly lead = input.required<Lead>();
  readonly current = input(false);
  readonly pick = output<Lead>();
  readonly ask = output<Lead>();
  readonly park = output<Lead>();

  protected readonly chip = computed(() => momentText(this.lead().moment));
  protected readonly name = computed(() => callName(this.lead().clientName));
}
