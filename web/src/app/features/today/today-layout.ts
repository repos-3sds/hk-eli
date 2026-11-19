import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { Composer } from './composer/composer';
import { ContextDock } from './dock/context-dock';
import { LeadActions } from './brief/lead-actions';
import { TodayStore } from './today.store';

/** Today tab frame: the view (brief or ideas) on the left, the client dock on the right. The brief puts the ask box near its top; other views keep it at the foot. */
@Component({
  selector: 'eli-today-layout',
  imports: [MatIconModule, MatTooltipModule, RouterOutlet, Composer, ContextDock],
  providers: [TodayStore, LeadActions],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="main">
      <div class="view eli-scroll"><router-outlet /></div>
      @if (!onBrief()) {
        <eli-composer />
      }
    </div>
    @if (store.dockOpen()) {
      <eli-context-dock class="dock" />
    } @else {
      <button type="button" class="reopen" (click)="store.dockOpen.set(true)" aria-label="Show the client panel" matTooltip="Show the client panel" matTooltipPosition="left">
        <mat-icon svgIcon="panel-right-open" aria-hidden="true" />
        <span class="reopen-label">Client panel</span>
      </button>
    }
  `,
  styles: `
    :host { display: flex; gap: var(--eli-space-7); height: 100%; padding: var(--eli-space-4) var(--eli-space-7) var(--eli-space-4) var(--eli-space-7); }
    .main { display: flex; flex-direction: column; gap: var(--eli-space-7); flex: 1; min-width: 0; }
    .view { flex: 1; min-height: 0; overflow: auto; padding-right: var(--eli-space-2); }
    .dock { flex: none; width: var(--eli-dock-width); }
    @container widget (max-width: 1280px) { .dock { width: 380px; } }
    .reopen {
      display: flex; flex-direction: column; align-items: center; gap: var(--eli-space-4); flex: none; width: 32px;
      padding: var(--eli-space-6) 0; border: 1px solid var(--eli-border); border-radius: var(--eli-radius-m);
      background: var(--eli-bg-dock); color: var(--eli-text-muted-2); cursor: pointer; font: inherit;
      &:hover { color: var(--eli-text-strong); background: var(--eli-bg-row); }
      mat-icon { width: 16px; height: 16px; }
    }
    .reopen-label { writing-mode: vertical-rl; font-size: var(--eli-font-size-s); letter-spacing: 0.04em; }
    @container widget (max-width: 1080px) { .dock, .reopen { display: none; } }
  `,
})
export class TodayLayout {
  protected readonly store = inject(TodayStore);
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly onBrief = computed(() => /^\/today\/?(\?|#|$)/.test(this.url()));

  constructor() {
    // The landing view starts calm with the panel closed; views about one client (ideas) open it.
    effect(() => {
      if (!this.onBrief()) {
        untracked(() => this.store.dockOpen.set(true));
      }
    });
  }
}
