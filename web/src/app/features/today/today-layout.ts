import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Composer } from './composer/composer';
import { ContextDock } from './dock/context-dock';
import { LeadActions } from './brief/lead-actions';
import { TodayStore } from './today.store';

/** Today tab frame: the view (brief or ideas) and the composer on the left, the client dock on the right. */
@Component({
  selector: 'eli-today-layout',
  imports: [RouterOutlet, Composer, ContextDock],
  providers: [TodayStore, LeadActions],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="main">
      <div class="view eli-scroll"><router-outlet /></div>
      <eli-composer />
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
export class TodayLayout {}
