import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { APP_CONFIG } from '../../core/config/app-config';
import { currentScenario } from '../../core/data/page-load';
import { HandoffOpener } from '../../core/handoff/handoff-opener';
import { HandoffStore } from '../../core/handoff/handoff.store';
import { AlertsStore } from '../../core/alerts/alerts.store';
import { WIDGET_TABS } from './widget-tabs';
import { FirstRun } from '../help/first-run';
import { FirstRunStore } from '../help/first-run.store';
import { ROLE_HOME_TABS } from '../../core/help/help-content';
import { SessionService } from '../../core/session/session.service';

/**
 * The Digimarkets widget: orange caps title bar with link, pin, pop-out and close, the 80 px
 * tab rail, and the tab's content (HK ELI Figma 1:10272; tabs from the Moment Console redesign).
 */
@Component({
  selector: 'eli-widget-frame',
  imports: [MatIconModule, MatTooltipModule, RouterLink, RouterLinkActive, RouterOutlet, FirstRun],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="widget" [attr.aria-label]="appName">
      <header class="title-bar">
        <h1 class="title">{{ appName }}</h1>
        <span class="internal" matTooltip="Internal use only until launch feedback is good. Nothing here goes to clients.">Internal use only</span>
        <button type="button" class="handoff" (click)="handoffs.open()" [attr.aria-label]="'Hand-off list, ' + handoff.count() + ' to hand off'">
          <mat-icon svgIcon="clipboard-list" aria-hidden="true" />Hand-off list
          @if (handoff.count()) { <span class="hcount">{{ handoff.count() }}</span> }
        </button>
        <div class="actions">
          <button type="button" class="act link off" matTooltip="Not linked to other widgets yet" aria-label="Widget links: not linked yet" aria-disabled="true"><mat-icon svgIcon="link" /></button>
          <button type="button" class="act pin" [class.on]="pinned()" [matTooltip]="pinned() ? 'Unpin' : 'Pin'" [attr.aria-pressed]="pinned()" aria-label="Pin widget" (click)="togglePin()"><mat-icon svgIcon="dm-pin" /></button>
          <button type="button" class="act open" matTooltip="Pop out" aria-label="Pop out widget" (click)="info('Pop-out opens the widget in its own window in Digimarkets.')"><mat-icon svgIcon="dm-open" /></button>
          <button type="button" class="act close" matTooltip="Close" aria-label="Close widget" (click)="info('Closing is handled by the Digimarkets workspace.')"><mat-icon svgIcon="x" /></button>
        </div>
      </header>
      <div class="body">
        <nav class="tabs" aria-label="HK ELI Chatbot tabs">
          @for (tab of tabs; track tab.path) {
            <a class="tab" [routerLink]="['/', tab.path]" routerLinkActive="active" #rla="routerLinkActive" [attr.aria-current]="rla.isActive ? 'page' : null">
              <mat-icon [svgIcon]="tab.icon" aria-hidden="true" />
              <span class="tab-label">
                {{ tab.label }}
                @if (forYou().includes(tab.path)) { <span class="for-you" aria-hidden="true"></span><span class="eli-visually-hidden">, suggested for your role</span> }
                @let badge = tab.path === 'alerts' ? (noData ? 0 : alerts.count()) : tab.badge;
                @if (badge) {
                  <span class="badge" [attr.aria-label]="badge + ' new'">{{ badge }}</span>
                }
              </span>
            </a>
          }
        </nav>
        <div class="content">
          @if (firstRun.show()) { <eli-first-run /> }
          <router-outlet />
        </div>
      </div>
    </section>
  `,
  styleUrl: './widget-frame.scss',
})
export class WidgetFrame {
  private readonly snack = inject(MatSnackBar);
  protected readonly appName = inject(APP_CONFIG).appName;
  protected readonly tabs = WIDGET_TABS;
  protected readonly pinned = signal(false);
  protected readonly handoff = inject(HandoffStore);
  protected readonly alerts = inject(AlertsStore);
  protected readonly handoffs = inject(HandoffOpener);
  protected readonly firstRun = inject(FirstRunStore);
  /** With no overnight data, no alert can fire, so the Alerts badge stays off. */
  protected readonly noData = currentScenario(inject(APP_CONFIG), inject(DOCUMENT)) === 'empty';
  protected readonly session = inject(SessionService);
  /** The role's home tabs get a small "for you" mark, so a first-time user knows where to start. */
  protected readonly forYou = computed(() => ROLE_HOME_TABS[this.session.role()]);

  protected togglePin(): void {
    this.pinned.update((v) => !v);
  }

  protected info(message: string): void {
    this.snack.open(message, 'OK', { duration: 3000 });
  }
}
