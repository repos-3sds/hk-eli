import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Signal } from '../../../core/models/today.models';
import { SignalPanel } from './signal-panel';

/** "●●●●●○ 5 of 6 signals agree". Pressing it opens the signals behind the count. */
@Component({
  selector: 'eli-agreement-dots',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, MatTooltipModule, SignalPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="dots" cdkOverlayOrigin #origin="cdkOverlayOrigin" [attr.aria-expanded]="open()" aria-haspopup="dialog" (click)="open.set(!open())">
      <span class="label"><strong>{{ met() }} of {{ signals().length }}</strong> signals agree</span>
      <span class="row" aria-hidden="true">
        @for (s of ordered(); track s.id) {
          <span class="dot" [class.on]="s.met" [matTooltip]="(s.met ? 'Yes: ' : 'No: ') + s.name"></span>
        }
      </span>
    </button>
    <ng-template cdkConnectedOverlay [cdkConnectedOverlayOrigin]="origin" [cdkConnectedOverlayOpen]="open()" [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayHasBackdrop]="true" cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      (backdropClick)="open.set(false)" (detach)="open.set(false)" (overlayKeydown)="onKey($event)">
      <eli-signal-panel role="dialog" aria-label="Signals" [signals]="signals()" />
    </ng-template>
  `,
  styles: `
    .dots {
      display: inline-flex; align-items: center; gap: var(--eli-space-3); padding: var(--eli-space-1) var(--eli-space-2);
      border: 0; border-radius: var(--eli-radius-s); background: none; color: var(--eli-text-muted-2); cursor: pointer;
      font-size: var(--eli-font-size-s); line-height: var(--eli-line-height-s);
      &:hover { background: var(--eli-bg-row); }
    }
    .row { display: inline-flex; gap: var(--eli-space-2); }
    .dot { width: 8px; height: 8px; border-radius: 50%; border: 1px solid var(--eli-text-muted-2); }
    .dot.on { border-color: var(--eli-accent-link); background: var(--eli-accent-link); }
    .label strong { color: var(--eli-text-strong); font-weight: var(--eli-weight-semibold); }
  `,
})
export class AgreementDots {
  readonly signals = input.required<readonly Signal[]>();
  protected readonly met = computed(() => this.signals().filter((s) => s.met).length);
  /** Filled dots first, so the count reads at a glance. */
  protected readonly ordered = computed(() => [...this.signals()].sort((a, b) => Number(b.met) - Number(a.met)));
  protected readonly open = signal(false);
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
  ];

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.open.set(false);
    }
  }
}
