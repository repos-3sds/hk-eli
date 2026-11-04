import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { SCOPE_OPTIONS } from '../../../core/models/today.models';
import { TodayStore } from '../today.store';

/**
 * Which part of the business Today shows. Launch users see all trades, so the default is the whole business;
 * they can narrow to a branch, a segment or the digibank channel.
 */
@Component({
  selector: 'eli-scope-switch',
  imports: [MatIconModule, MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="scope" [matMenuTriggerFor]="menu" [attr.aria-label]="'Showing ' + store.scopeName() + '. Change scope'">
      <mat-icon svgIcon="layers" aria-hidden="true" />
      <span class="lbl">Showing</span> {{ store.scopeName() }}
      <mat-icon svgIcon="chevron-down" aria-hidden="true" />
    </button>
    <mat-menu #menu="matMenu">
      @for (g of groups; track g) {
        <div class="group" role="presentation">{{ g }}</div>
        @for (o of byGroup(g); track o.id) {
          <button mat-menu-item type="button" role="menuitemradio" [attr.aria-checked]="store.scope() === o.id" (click)="store.setScope(o.id)">
            @if (store.scope() === o.id) { <mat-icon svgIcon="check" aria-hidden="true" /> } @else { <span class="pad"></span> }
            {{ o.label }}
          </button>
        }
      }
    </mat-menu>
  `,
  styles: `
    .scope {
      display: inline-flex;
      align-items: center;
      gap: var(--eli-space-3);
      height: 28px;
      padding: 0 var(--eli-space-5);
      border: 1px solid var(--eli-border);
      border-radius: var(--eli-radius-s);
      background: var(--eli-bg-dock);
      color: var(--eli-text-strong);
      font: inherit;
      font-size: var(--eli-font-size-s);
      font-weight: var(--eli-weight-semibold);
      cursor: pointer;
      &:hover { border-color: var(--eli-accent-link); }
      mat-icon { width: 14px; height: 14px; color: var(--eli-text-muted-2); }
    }
    .lbl { color: var(--eli-text-muted-2); font-weight: normal; }
    .group { padding: 8px 16px 2px; color: var(--eli-text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    .pad { display: inline-block; width: 24px; }
  `,
})
export class ScopeSwitch {
  protected readonly store = inject(TodayStore);
  protected readonly groups = [...new Set(SCOPE_OPTIONS.map((o) => o.group))];
  protected byGroup(g: string) {
    return SCOPE_OPTIONS.filter((o) => o.group === g);
  }
}
