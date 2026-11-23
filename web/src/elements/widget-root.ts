import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { WidgetFrame } from '../app/shell/widget-frame/widget-frame';

/**
 * The root of <hk-eli-chatbot>: the same widget frame (title bar, tab rail, Today, Chat, Prompts) as the
 * standalone app, without the Digimarkets header and side bar, which the host already draws.
 * Shadow DOM keeps the widget's styles in and the host page's styles out.
 */
@Component({
  selector: 'hk-eli-chatbot-root',
  imports: [WidgetFrame],
  encapsulation: ViewEncapsulation.ShadowDom,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<eli-widget-frame />`,
  styles: `
    :host {
      display: block;
      position: relative;
      height: 100%;
      min-height: 480px;
      color: var(--eli-text-primary);
      font-family: var(--eli-font-sans);
      font-size: var(--eli-font-size-m);
      line-height: var(--eli-line-height-m);
      font-variant-numeric: tabular-nums;
      -webkit-font-smoothing: antialiased;
      text-align: left;
    }
  `,
})
export class WidgetRoot {}
