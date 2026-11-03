import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

/** The Digimarkets application rail: workspaces, widgets, pages (HK ELI Figma 1:11317). */
@Component({
  selector: 'eli-app-sidebar',
  imports: [MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="rail" aria-label="Digimarkets">
      @for (item of items; track item.icon) {
        <button type="button" class="item" [matTooltip]="item.label" matTooltipPosition="right" [attr.aria-label]="item.label">
          <mat-icon [svgIcon]="item.icon" />
        </button>
      }
    </nav>
  `,
  styles: `
    :host { display: block; }
    .rail {
      display: flex; flex-direction: column; align-items: center; gap: var(--eli-space-4);
      width: var(--eli-sidebar-width); height: 100%; padding-top: var(--eli-space-2); background: var(--eli-bg-sidebar);
    }
    .item {
      display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: var(--eli-radius-s);
      background: none; color: var(--eli-text-strong); cursor: pointer;
      &:hover { background: var(--eli-bg-row); }
      mat-icon { width: 17px; height: 16px; }
    }
  `,
})
export class AppSidebar {
  protected readonly items = [
    { icon: 'dm-workspaces', label: 'Workspaces' },
    { icon: 'dm-widgets', label: 'Widgets' },
    { icon: 'dm-pages', label: 'Pages' },
  ];
}
