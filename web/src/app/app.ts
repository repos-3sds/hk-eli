import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppHeader } from './shell/app-header/app-header';
import { AppSidebar } from './shell/app-sidebar/app-sidebar';
import { WidgetFrame } from './shell/widget-frame/widget-frame';

/** The Digimarkets workspace with the HK ELI Chatbot widget. */
@Component({
  selector: 'eli-root',
  imports: [AppHeader, AppSidebar, WidgetFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <eli-app-header />
    <div class="workspace">
      <eli-app-sidebar />
      <main class="stage">
        <eli-widget-frame />
      </main>
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; height: 100vh; min-height: 600px; }
    .workspace { display: flex; flex: 1; min-height: 0; }
    .stage { flex: 1; min-width: 0; padding: var(--eli-widget-gap); }
  `,
})
export class App {}
