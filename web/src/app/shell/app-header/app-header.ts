import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SessionService } from '../../core/session/session.service';

/** The Digimarkets top bar: logo, workspace tabs, greeting and platform actions (HK ELI Figma 1:11321). */
@Component({
  selector: 'eli-app-header',
  imports: [MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bar" role="banner">
      <img class="logo" src="brand/digimarkets-logo.svg" width="149" height="30" alt="digimarkets 2.0.0" />
      <nav class="workspaces" aria-label="Workspaces">
        @for (ws of workspaces; track ws) {
          <button type="button" class="ws-tab" [class.active]="ws === activeWorkspace()" [attr.aria-current]="ws === activeWorkspace() ? 'page' : null" (click)="activeWorkspace.set(ws)">
            {{ ws }}
            @if (ws === activeWorkspace()) {
              <mat-icon class="ws-close" svgIcon="x" aria-hidden="true" />
            }
          </button>
        }
      </nav>
      <div class="right">
        <span class="welcome">Welcome back, {{ session.user().displayName }}</span>
        <span class="sep" aria-hidden="true"></span>
        <button type="button" class="icon-btn" matTooltip="Add widget" aria-label="Add widget"><mat-icon svgIcon="dm-plus" /></button>
        <button type="button" class="icon-btn" matTooltip="Help" aria-label="Help"><mat-icon svgIcon="dm-faq" /></button>
        <button type="button" class="icon-btn" matTooltip="Log out" aria-label="Log out"><mat-icon svgIcon="dm-logout" /></button>
      </div>
    </header>
  `,
  styles: `
    :host { display: block; }
    .bar {
      display: flex; align-items: center; height: var(--eli-app-header-height);
      background: var(--eli-bg-app-header); padding: 0 var(--eli-space-6) 0 21px;
    }
    .logo { display: block; flex: none; }
    .workspaces { display: flex; gap: var(--eli-space-1); align-self: flex-end; margin-left: 38px; }
    .ws-tab {
      display: flex; align-items: center; gap: var(--eli-space-2); height: 27px;
      padding: var(--eli-space-2) var(--eli-space-7); border: 1px solid var(--eli-border); border-bottom: 0;
      border-radius: var(--eli-radius-s) var(--eli-radius-s) 0 0; cursor: pointer;
      background: var(--eli-bg-workspace-tab-idle); color: var(--eli-text-workspace-idle); font-size: var(--eli-font-size-m);
    }
    .ws-tab.active { background: var(--eli-bg-workspace-tab); color: var(--eli-text-strong); padding-right: var(--eli-space-2); }
    .ws-close { width: 10px; height: 10px; color: var(--eli-text-workspace-idle); align-self: flex-start; }
    .right { display: flex; align-items: center; gap: var(--eli-space-6); margin-left: auto; height: 100%; }
    .welcome { color: var(--eli-text-strong); font-size: var(--eli-font-size-m); font-weight: var(--eli-weight-semibold); }
    .sep { width: 2px; height: 100%; background: var(--eli-separator); order: -1; margin-right: var(--eli-space-6); }
    .icon-btn {
      display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: var(--eli-radius-s);
      background: none; color: var(--eli-text-strong); cursor: pointer;
      &:hover { background: var(--eli-bg-workspace-tab); }
      mat-icon { width: 18px; height: 18px; }
    }
    @media (max-width: 900px) { .workspaces, .welcome, .sep { display: none; } }
  `,
})
export class AppHeader {
  protected readonly session = inject(SessionService);
  protected readonly workspaces = ['My Workspace 1', 'My Workspace 2'];
  protected readonly activeWorkspace = signal(this.workspaces[0]);
}
