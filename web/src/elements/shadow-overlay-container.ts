import { Injectable, InjectionToken, inject } from '@angular/core';
import { OverlayContainer } from '@angular/cdk/overlay';

/** The <hk-eli-chatbot> element this app instance renders into. */
export const ELEMENT_HOST = new InjectionToken<HTMLElement>('ELEMENT_HOST');

/**
 * Puts Material overlays (menus, tooltips, dialogs, snack bars) inside the element's shadow root instead of
 * document.body. Outside the shadow root they would lose the widget's styles and tokens, and could pick up
 * the host page's CSS.
 */
@Injectable()
export class ShadowOverlayContainer extends OverlayContainer {
  private readonly host = inject(ELEMENT_HOST);

  protected override _createContainer(): void {
    const root = this.host.shadowRoot;
    if (!root) {
      super._createContainer();
      return;
    }
    const container = this._document.createElement('div');
    container.classList.add('cdk-overlay-container');
    root.appendChild(container);
    this._containerElement = container;
  }
}
