import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

/** Tabs that come after Today. Shows what the tab will do and keeps a question asked from Today. */
@Component({
  selector: 'eli-tab-placeholder',
  imports: [MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="wrap tw:flex tw:flex-col tw:items-center tw:gap-4">
      <mat-icon [svgIcon]="icon()" aria-hidden="true" />
      <h2 class="title">{{ title() }}</h2>
      <p class="text">{{ purpose() }}</p>
      @if (q()) {
        <p class="question">Your question is kept for when Chat is built: <q>{{ q() }}</q></p>
      }
      <a class="eli-link" routerLink="/rm/today">Back to Today</a>
    </section>
  `,
  styles: `
    :host { display: grid; place-items: center; height: 100%; padding: var(--eli-space-8); }
    .wrap { max-width: 560px; text-align: center; }
    mat-icon { width: 32px; height: 32px; color: var(--eli-accent-orange); }
    .title { margin: var(--eli-space-4) 0; color: var(--eli-text-strong); font-size: var(--eli-font-size-xl); font-weight: var(--eli-weight-semibold); }
    .text { color: var(--eli-text-muted-2); }
    .question { padding: var(--eli-space-6); border-radius: var(--eli-radius-s); background: var(--eli-bg-surface); }
  `,
})
export class TabPlaceholder {
  readonly title = input.required<string>();
  readonly purpose = input.required<string>();
  readonly icon = input.required<string>();
  /** ?q= from the composer */
  readonly q = input<string>();
}
