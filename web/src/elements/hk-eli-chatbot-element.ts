import { ApplicationRef, ComponentRef, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { LocationStrategy } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { OverlayContainer } from '@angular/cdk/overlay';
import { APP_CONFIG } from '../app/core/config/app-config';
import { provideChatData } from '../app/core/chat/provide-chat-data';
import { provideIcons } from '../app/core/icons/icons';
import { traceInterceptor } from '../app/core/trace/trace.interceptor';
import { callerInterceptor } from '../app/core/session/caller.interceptor';
import { SessionService } from '../app/core/session/session.service';
import { routes } from '../app/app.routes';
import { ACCESS_TOKEN_PROVIDER, AccessTokenProvider, accessTokenInterceptor } from './auth.interceptor';
import { ELEMENT_ATTRIBUTES, ElementAttribute, ElementSettings, LIVE_ATTRIBUTES, buildElementSettings } from './element-config';
import { MemoryLocationStrategy } from './memory-location';
import { ELEMENT_HOST, ShadowOverlayContainer } from './shadow-overlay-container';
import { WidgetRoot } from './widget-root';

export const TAG_NAME = 'hk-eli-chatbot';
const FONT_STYLE_ID = 'hk-eli-chatbot-fonts';

/**
 * <hk-eli-chatbot api-base-url="/api/stork" role="wms"></hk-eli-chatbot>
 *
 * Each element runs its own small Angular application (its own config, router and overlays), so two widgets on
 * one Digimarkets page don't share state. Config changes restart the widget; role and user-name switch in place.
 *
 * Events (bubble, composed): `hk-eli-ready` once the widget is up, `hk-eli-error` with `detail.message` if it
 * could not start (the element also shows the reason).
 */
export class HkEliChatbotElement extends HTMLElement {
  static readonly observedAttributes = [...ELEMENT_ATTRIBUTES];
  static version = typeof __HK_ELI_VERSION__ === 'string' ? __HK_ELI_VERSION__ : 'dev';

  private app: ApplicationRef | null = null;
  private ref: ComponentRef<WidgetRoot> | null = null;
  private starting: Promise<void> | null = null;
  private restartQueued = false;
  private tokenProvider: AccessTokenProvider | null = null;
  private readonly outer: ShadowRoot;

  constructor() {
    super();
    // The outer shadow root holds a fresh mount point per start; Angular gives that mount point its own shadow
    // root (WidgetRoot uses ViewEncapsulation.ShadowDom), so a restart never reuses an old one.
    this.outer = this.attachShadow({ mode: 'open' });
  }

  /** The host sets this to hand over the signed-in user's SSO token: `el.accessTokenProvider = () => token`. */
  get accessTokenProvider(): AccessTokenProvider | null {
    return this.tokenProvider;
  }
  set accessTokenProvider(fn: AccessTokenProvider | null) {
    this.tokenProvider = typeof fn === 'function' ? fn : null;
  }

  connectedCallback(): void {
    // Upgrade a property set before the element was defined.
    const own = Object.getOwnPropertyDescriptor(this, 'accessTokenProvider');
    if (own) {
      delete (this as unknown as Record<string, unknown>)['accessTokenProvider'];
      this.accessTokenProvider = own.value as AccessTokenProvider | null;
    }
    ensureFonts(this.ownerDocument);
    if (!this.app && !this.starting) this.starting = this.start();
  }

  disconnectedCallback(): void {
    // A move within the page (disconnect then connect in the same task) keeps the running widget.
    queueMicrotask(() => {
      if (!this.isConnected) this.stop();
    });
  }

  attributeChangedCallback(name: ElementAttribute, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue || (!this.app && !this.starting)) return;
    if (LIVE_ATTRIBUTES.includes(name) && this.app) {
      this.applyIdentity();
      return;
    }
    this.restart();
  }

  private async start(): Promise<void> {
    try {
      const settings = await this.readSettings();
      const mount = this.ownerDocument.createElement('div');
      mount.className = 'mount';
      this.outer.replaceChildren(outerStyle(this.ownerDocument), mount);
      const app = await createApplication({
        providers: [
          provideBrowserGlobalErrorListeners(),
          provideZonelessChangeDetection(),
          provideRouter(routes, withComponentInputBinding()),
          { provide: LocationStrategy, useClass: MemoryLocationStrategy },
          provideHttpClient(withFetch(), withInterceptors([traceInterceptor, callerInterceptor, accessTokenInterceptor])),
          { provide: APP_CONFIG, useValue: settings.config },
          { provide: ELEMENT_HOST, useValue: mount },
          { provide: ACCESS_TOKEN_PROVIDER, useValue: () => this.tokenProvider },
          { provide: OverlayContainer, useClass: ShadowOverlayContainer },
          provideChatData(),
          provideIcons(),
        ],
      });
      this.app = app;
      this.applyIdentity(settings);
      const ref = app.bootstrap(WidgetRoot, mount);
      this.ref = ref;
      injectShadowStyles(mount.shadowRoot);
      await app.injector.get(Router).navigateByUrl(`/${settings.startTab}`);
      this.dispatchEvent(new CustomEvent('hk-eli-ready', { bubbles: true, composed: true, detail: { version: HkEliChatbotElement.version } }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.stop();
      this.showMessage(`HK ELI Chatbot could not start: ${message}`);
      this.dispatchEvent(new CustomEvent('hk-eli-error', { bubbles: true, composed: true, detail: { message } }));
      console.error(err);
    } finally {
      this.starting = null;
      if (this.restartQueued) {
        this.restartQueued = false;
        this.restart();
      }
    }
  }

  private restart(): void {
    if (this.starting) {
      this.restartQueued = true;
      return;
    }
    this.stop();
    if (this.isConnected) this.starting = this.start();
  }

  private stop(): void {
    this.ref = null;
    if (this.app && !this.app.destroyed) this.app.destroy();
    this.app = null;
    this.outer.replaceChildren();
  }

  private async readSettings(): Promise<ElementSettings> {
    const attr = (name: ElementAttribute) => this.getAttribute(name);
    const url = attr('config-url');
    let fromFile: object | null = null;
    if (url?.trim()) {
      const res = await fetch(new URL(url, this.ownerDocument.baseURI), { cache: 'no-store' });
      if (!res.ok) throw new Error(`Could not load ${url}: ${res.status}`);
      fromFile = (await res.json()) as object;
    }
    return buildElementSettings(this.defaults, attr, fromFile);
  }

  /** Role and display name from the host (Digimarkets entitlements); otherwise the fictional demo user. */
  private applyIdentity(settings?: ElementSettings): void {
    if (!this.app) return;
    const session = this.app.injector.get(SessionService);
    const s = settings ?? buildElementSettings(this.defaults, (n) => this.getAttribute(n));
    if (s.role) session.switchRole(s.role);
    if (s.userName) {
      const name = s.userName;
      session.user.update((u) => ({ ...u, displayName: name, firstName: name.split(/\s+/)[0] }));
    }
  }

  private showMessage(text: string): void {
    const box = this.ownerDocument.createElement('p');
    box.setAttribute('role', 'alert');
    box.style.cssText =
      'margin:0;padding:16px;border:1px solid #36485e;border-radius:8px;background:#222b3f;color:#e5e5e5;font:14px/20px "Open Sans Variable","Open Sans",system-ui,sans-serif';
    box.textContent = text;
    this.outer.replaceChildren(outerStyle(this.ownerDocument), box);
  }

  /** Set by defineHkEliChatbot: the standalone app's config file, used as defaults. */
  protected get defaults(): object {
    return (this.constructor as typeof HkEliChatbotElement & { defaults?: object }).defaults ?? {};
  }
}

/** Registers <hk-eli-chatbot> once. Safe to call twice (a host that loads the script twice). */
export function defineHkEliChatbot(defaults: object, registry: CustomElementRegistry = customElements): void {
  if (registry.get(TAG_NAME)) return;
  class Defined extends HkEliChatbotElement {
    static defaults = defaults;
  }
  registry.define(TAG_NAME, Defined);
}

/** Sizing for the element itself: it fills the box the host gives it. */
function outerStyle(doc: Document): HTMLStyleElement {
  const style = doc.createElement('style');
  style.textContent = ':host{display:block;position:relative;min-height:480px}:host([hidden]){display:none}.mount{height:100%}';
  return style;
}

/**
 * The widget's global CSS (tokens, Material theme, Tailwind utilities, shared classes), rewritten so :root,
 * html and body become :host. It goes first in the shadow root, so component styles still win as they do in
 * the standalone app.
 */
function injectShadowStyles(root: ShadowRoot | null): void {
  if (!root || typeof __HK_ELI_SHADOW_CSS__ !== 'string') return;
  const style = root.ownerDocument.createElement('style');
  style.setAttribute('data-hk-eli', 'global');
  style.textContent = __HK_ELI_SHADOW_CSS__;
  root.prepend(style);
}

/** Browsers ignore @font-face inside a shadow root, so the font is registered once on the host document. */
function ensureFonts(doc: Document): void {
  if (typeof __HK_ELI_DOCUMENT_CSS__ !== 'string' || !__HK_ELI_DOCUMENT_CSS__ || doc.getElementById(FONT_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = FONT_STYLE_ID;
  style.textContent = __HK_ELI_DOCUMENT_CSS__;
  doc.head.appendChild(style);
}
