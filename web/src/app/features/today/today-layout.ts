import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { Composer } from './composer/composer';
import { ContextDock } from './dock/context-dock';
import { LeadActions } from './brief/lead-actions';
import { TodayStore } from './today.store';

/** Today tab frame: the view (brief or ideas) on the left, the client dock on the right. The brief puts the ask box near its top; other views keep it at the foot. */
@Component({
  selector: 'eli-today-layout',
  imports: [RouterOutlet, Composer, ContextDock],
  providers: [TodayStore, LeadActions],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="main">
      <div class="view eli-scroll"><router-outlet /></div>
      @if (!onBrief()) {
        <eli-composer />
      }
    </div>
    <eli-context-dock class="dock" />
  `,
  styles: `
    :host { display: flex; gap: var(--eli-space-7); height: 100%; padding: var(--eli-space-4) var(--eli-space-7) var(--eli-space-4) var(--eli-space-7); }
    .main { display: flex; flex-direction: column; gap: var(--eli-space-7); flex: 1; min-width: 0; }
    .view { flex: 1; min-height: 0; overflow: auto; padding-right: var(--eli-space-2); }
    .dock { flex: none; width: var(--eli-dock-width); }
    @container widget (max-width: 1280px) { .dock { width: 380px; } }
    @container widget (max-width: 1080px) { .dock { display: none; } }
  `,
})
export class TodayLayout {
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly onBrief = computed(() => /^\/rm\/today\/?(\?|#|$)/.test(this.url()));
}
