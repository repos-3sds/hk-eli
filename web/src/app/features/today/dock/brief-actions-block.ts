import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { LeadActions } from '../brief/lead-actions';
import { AgreementDots } from '../shared/agreement-dots';
import { MomentChip } from '../shared/moment-chip';
import { callName, momentText } from '../shared/moment-text';
import { TodayStore } from '../today.store';

/**
 * The top of the right-hand panel when the client in it is in today's brief:
 * why today, which signals agree and which do not, and what to do next.
 * Previous and next step through the brief without going back to the list.
 */
@Component({
  selector: 'eli-brief-actions-block',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, RouterLink, AgreementDots, MomentChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.focusedLead(); as lead) {
      <section class="block" aria-labelledby="brief-act-h">
        <div class="head">
          <h3 id="brief-act-h" class="eli-eyebrow">Morning brief · {{ store.focusedRank() }} of {{ store.openLeads().length }}</h3>
          <span class="grow"></span>
          <button matIconButton type="button" class="step" aria-label="Previous client in the brief" matTooltip="Previous" (click)="store.stepLead(-1)">
            <mat-icon svgIcon="chevron-left" />
          </button>
          <button matIconButton type="button" class="step" aria-label="Next client in the brief" matTooltip="Next" (click)="store.stepLead(1)">
            <mat-icon svgIcon="chevron-right" />
          </button>
        </div>
        <eli-moment-chip class="chip" [type]="lead.moment.type">{{ chip() }}</eli-moment-chip>
        <p class="why">{{ lead.summary }}</p>
        <div class="signals">
          <eli-agreement-dots [signals]="lead.signals" />
          @if (missing().length > 0) {
            <p class="missing">Not met: {{ missing().join(', ') }}</p>
          }
        </div>
        <div class="actions">
          <a matButton="filled" class="primary" routerLink="/ideas" [queryParams]="{ client: lead.clientId }">{{ lead.action.label }}</a>
          <div class="secondary">
            <button matButton="outlined" type="button" (click)="actions.ask(lead)">Ask about {{ name() }}</button>
            <button matButton type="button" (click)="actions.park(lead)">Mark reviewed</button>
          </div>
        </div>
      </section>
    }
  `,
  styles: `
    :host { display: contents; }
    .block {
      display: flex; flex-direction: column; gap: var(--eli-space-5); padding: var(--eli-space-6) var(--eli-space-7);
      border-left: 3px solid var(--eli-accent-orange); border-radius: var(--eli-radius-m); background: var(--eli-bg-surface); flex: none;
    }
    .head { display: flex; align-items: center; gap: var(--eli-space-2); margin: calc(-1 * var(--eli-space-3)) calc(-1 * var(--eli-space-4)) 0 0; }
    .head h3 { margin: 0; }
    .grow { flex: 1; }
    .step { --mat-icon-button-state-layer-size: 28px; width: 28px; height: 28px; padding: 0; mat-icon { width: 16px; height: 16px; } }
    .chip { align-self: flex-start; }
    .why { margin: 0; color: var(--eli-text-primary); font-size: var(--eli-font-size-m); line-height: var(--eli-line-height-m); }
    .signals { display: flex; flex-direction: column; gap: var(--eli-space-1); align-items: flex-start; margin-left: calc(-1 * var(--eli-space-2)); }
    .missing { margin: 0 0 0 var(--eli-space-2); color: var(--eli-text-muted); font-size: var(--eli-font-size-s); line-height: var(--eli-line-height-s); }
    .actions { display: flex; flex-direction: column; gap: var(--eli-space-4); }
    .primary { width: 100%; }
    .secondary { display: flex; gap: var(--eli-space-4); flex-wrap: wrap; }
  `,
})
export class BriefActionsBlock {
  protected readonly store = inject(TodayStore);
  protected readonly actions = inject(LeadActions);

  protected readonly chip = computed(() => {
    const lead = this.store.focusedLead();
    return lead ? momentText(lead.moment) : '';
  });
  protected readonly name = computed(() => callName(this.store.focusedLead()?.clientName ?? ''));
  protected readonly missing = computed(() => (this.store.focusedLead()?.signals ?? []).filter((s) => !s.met).map((s) => s.name));
}
