import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageLoad } from './page-load';

/**
 * The loading, empty and error states for a tab, so every tab answers "is it working?" the same way.
 * Loading shows skeleton cards; error hides every figure and offers Try again; empty says what would fill it.
 */
@Component({
  selector: 'eli-load-state',
  imports: [MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (load().state()) {
      @case ('loading') {
        <div class="sk" aria-busy="true" aria-live="polite">
          <span class="eli-visually-hidden">Loading {{ what() }}</span>
          @for (h of skeleton(); track $index) {
            <div class="eli-skeleton" [style.height.px]="h"></div>
          }
        </div>
      }
      @case ('error') {
        <div class="state error" role="alert">
          <mat-icon svgIcon="circle-alert" aria-hidden="true" />
          <span><strong>{{ what() }} could not be loaded.</strong> {{ load().failureText }} No figures are shown so nothing out of date is read as current.</span>
          <button matButton="outlined" type="button" (click)="load().reload()"><mat-icon svgIcon="refresh-cw" />Try again</button>
        </div>
      }
      @case ('empty') {
        <div class="state" role="status">
          <mat-icon svgIcon="package" aria-hidden="true" />
          <span><strong>{{ emptyTitle() }}</strong> {{ emptyText() }}</span>
        </div>
      }
    }
  `,
  styles: `
    :host { display: block; }
    .sk { display: grid; gap: var(--eli-space-6); }
    .state { display: flex; align-items: center; gap: var(--eli-space-6); padding: var(--eli-space-7); border-radius: var(--eli-radius-s);
      background: var(--eli-bg-surface); color: var(--eli-text-primary); font-size: var(--eli-font-size-m);
      mat-icon { flex: none; width: 20px; height: 20px; color: var(--eli-text-muted-2); } span { flex: 1; } strong { font-weight: 600; } }
    .state.error { border-left: 3px solid var(--eli-status-negative); }
  `,
})
export class LoadState {
  readonly load = input.required<PageLoad>();
  readonly what = input.required<string>();
  readonly emptyTitle = input('Nothing to show yet.');
  readonly emptyText = input('');
  readonly skeleton = input<readonly number[]>([120, 220, 160]);
}
