import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { TableauEmbed } from '../chat/chat.models';

export type VizState = 'loading' | 'ready' | 'updating' | 'error';

/** Runtime calls the widget makes on an embedded view. Same names as the Tableau Embedding API v3. */
export interface VizDriver {
  changeParameterValueAsync(name: string, value: number | string): Promise<void>;
  applyFilterAsync(field: string, values: readonly string[]): Promise<void>;
  dispose(): void;
}

/** Only the agent's own mock view pages may load in the frame (same origin, under /tableau/). */
export function safeMockUrl(url: string | undefined): string | null {
  return url && /^\/tableau\/[A-Za-z0-9_-]+\/views\/[^?#]+(\?.*)?$/.test(url) ? url : null;
}

let seq = 0;

/**
 * The mock Tableau page answers the same runtime calls over postMessage (poc mock_tableau.EMBED_JS):
 * a call is posted to the frame, the page re-renders with the new value and replies "done" with the call's id.
 */
export class MockVizDriver implements VizDriver {
  private readonly pending = new Map<string, { ok: () => void; fail: (e: Error) => void }>();
  private readonly onMessage = (ev: MessageEvent) => {
    const d = ev.data as { source?: string; event?: string; id?: string; message?: string; height?: number } | null;
    if (ev.origin !== this.origin || ev.source !== this.frame.contentWindow || d?.source !== 'hkeli-viz') return;
    if (d.event === 'firstinteractive') this.events.firstInteractive();
    if (d.event === 'resize' && typeof d.height === 'number' && d.height > 0) this.events.resize?.(d.height);
    const p = d.id ? this.pending.get(d.id) : undefined;
    if (!p) return;
    this.pending.delete(d.id!);
    if (d.event === 'done') p.ok();
    else p.fail(new Error(d.message ?? 'The view could not update'));
  };

  constructor(
    private readonly frame: HTMLIFrameElement,
    private readonly origin: string,
    private readonly events: { firstInteractive: () => void; resize?: (height: number) => void },
    private readonly win: Window = window,
  ) {
    win.addEventListener('message', this.onMessage);
  }

  private call(msg: Record<string, unknown>): Promise<void> {
    const id = `c${++seq}`;
    return new Promise<void>((ok, fail) => {
      this.pending.set(id, { ok, fail });
      this.frame.contentWindow?.postMessage({ target: 'hkeli-viz', id, ...msg }, this.origin);
      setTimeout(() => {
        if (this.pending.delete(id)) fail(new Error('The view did not answer in time'));
      }, 10000);
    });
  }

  changeParameterValueAsync(name: string, value: number | string): Promise<void> {
    return this.call({ method: 'changeParameterValueAsync', name, value });
  }

  applyFilterAsync(field: string, values: readonly string[]): Promise<void> {
    return this.call({ method: 'applyFilterAsync', field, values: [...values] });
  }

  dispose(): void {
    this.win.removeEventListener('message', this.onMessage);
    this.pending.clear();
  }
}

/** A <tableau-viz> element (Embedding API v3) on the office Tableau server. */
interface TableauVizElement extends HTMLElement {
  workbook: {
    changeParameterValueAsync(name: string, value: number | string): Promise<unknown>;
    activeSheet: { applyFilterAsync(field: string, values: string[], updateType: 'replace' | 'add' | 'remove' | 'all'): Promise<unknown> };
  };
}

export class RealVizDriver implements VizDriver {
  constructor(private readonly viz: TableauVizElement) {}
  async changeParameterValueAsync(name: string, value: number | string): Promise<void> {
    await this.viz.workbook.changeParameterValueAsync(name, value);
  }
  async applyFilterAsync(field: string, values: readonly string[]): Promise<void> {
    await this.viz.workbook.activeSheet.applyFilterAsync(field, [...values], 'replace');
  }
  dispose(): void {
    this.viz.remove();
  }
}

let scriptLoading: Promise<void> | null = null;
function loadTableauScript(src: string): Promise<void> {
  scriptLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.type = 'module';
    s.src = src;
    s.onload = () => void customElements.whenDefined('tableau-viz').then(() => resolve());
    s.onerror = () => {
      scriptLoading = null;
      reject(new Error(`Tableau's embedding script didn't load from ${src}`));
    };
    document.head.append(s);
  });
  return scriptLoading;
}

/**
 * One embedded Tableau view with the answer's filters, and its parameters driven at runtime.
 * Mock mode: the agent's mock view page in a frame. Real mode: <tableau-viz> signed with a Connected App token.
 * States: loading, ready, updating (a parameter change is being applied), error with a retry.
 */
@Component({
  selector: 'eli-tableau-viz',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="frame" [style.height.px]="fit() ?? height()" [attr.aria-busy]="state() !== 'ready' && state() !== 'error'">
      @if (frameUrl(); as u) {
        <iframe #frame [src]="u" [title]="'Tableau view ' + embed().view" loading="lazy" (load)="onFrameLoad()"></iframe>
      }
      <div #host class="host"></div>
      @switch (state()) {
        @case ('loading') {<div class="veil" role="status"><span class="eli-spinner"></span>Loading {{ embed().view }}…</div>}
        @case ('updating') {<div class="badge" role="status"><span class="eli-spinner"></span>Updating</div>}
        @case ('error') {
          <div class="veil err" role="alert">
            <span>{{ error() }}</span>
            <button type="button" class="retry" (click)="reload()">Try again</button>
          </div>
        }
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .frame { position: relative; overflow: hidden; transition: height var(--eli-motion-fast); border: 1px solid var(--eli-separator); border-radius: var(--eli-radius-s); background: #11161f; }
    iframe, .host { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
    .host:empty { display: none; }
    .veil { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--eli-space-5);
      background: rgb(17 22 31 / 92%); color: var(--eli-text-muted); font-size: var(--eli-font-size-s); text-align: center; padding: var(--eli-space-7); }
    .veil.err { color: var(--eli-status-negative-text); }
    .badge { position: absolute; top: var(--eli-space-4); right: var(--eli-space-4); display: inline-flex; align-items: center; gap: var(--eli-space-3);
      padding: 2px var(--eli-space-5); border-radius: var(--eli-radius-pill); background: var(--eli-bg-surface); color: var(--eli-text-primary); font-size: var(--eli-font-size-xs); }
    .retry { height: 28px; padding: 0 var(--eli-space-7); border: 1px solid var(--eli-border); border-radius: var(--eli-radius-s); background: transparent; color: var(--eli-text-strong); font: inherit; font-size: var(--eli-font-size-s); cursor: pointer;
      &:hover { border-color: var(--eli-accent-link); } &:focus-visible { outline: 2px solid var(--eli-focus-ring); outline-offset: 2px; } }
  `,
})
export class TableauViz {
  readonly embed = input.required<TableauEmbed>();
  /** Parameter values to apply at runtime (name -> value). Changes are sent to the live view, not by reloading it. */
  readonly params = input<Readonly<Record<string, number | string>> | null>(null);
  /** Height before the view reports its own (and always, for real Tableau, which sizes inside its frame). */
  readonly height = input(340);

  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');

  protected readonly state = signal<VizState>('loading');
  protected readonly error = signal('');
  /** The mock page's own content height, so the whole view shows with no scroll inside the frame. */
  protected readonly fit = signal<number | null>(null);
  private readonly nonce = signal(0);
  private driver: VizDriver | null = null;
  private applied: Record<string, number | string> = {};
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected readonly frameUrl = computed<SafeResourceUrl | null>(() => {
    const n = this.nonce();
    const e = this.embed();
    if (e.mode === 'real') return null;
    const u = safeMockUrl(e.url);
    // ":r" makes "Try again" a fresh load; the mock ignores colon-prefixed keys, as Tableau does for its own ":" options
    return u ? this.sanitizer.bypassSecurityTrustResourceUrl(n ? `${u}${u.includes('?') ? '&' : '?'}:r=${n}` : u) : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.teardown());
    effect(() => {
      const e = this.embed();
      this.nonce();
      untracked(() => this.start(e));
    });
    effect(() => {
      const p = this.params();
      if (p && this.state() === 'ready') untracked(() => void this.apply(p));
    });
    // Listen to the mock page as soon as its frame exists, so its firstinteractive event is never missed.
    effect(() => {
      const f = this.frame()?.nativeElement;
      this.frameUrl();
      if (f && !this.driver) {
        untracked(() => (this.driver = new MockVizDriver(f, window.location.origin, {
          firstInteractive: () => this.ready(),
          resize: (h) => this.fit.set(h + 2), // + the frame's 1px border, top and bottom
        })));
      }
    });
  }

  protected reload(): void {
    this.nonce.update((n) => n + 1);
  }

  protected onFrameLoad(): void {
    // The page announces firstinteractive itself; a page without the runtime (older agent) is still a working view.
    setTimeout(() => this.state() === 'loading' && this.ready(), 1500);
  }

  private start(e: TableauEmbed): void {
    this.teardown();
    this.state.set('loading');
    this.applied = Object.fromEntries(e.parameters.map((p) => [p.name, p.value]));
    this.timer = setTimeout(() => {
      if (this.state() === 'loading') this.fail("The view didn't load. Tableau may be slow or unreachable.");
    }, 15000);
    if (e.mode === 'real') {
      void this.startReal(e);
    } else if (!safeMockUrl(e.url)) {
      this.fail('This view has no address to show.');
    }
  }

  private async startReal(e: TableauEmbed): Promise<void> {
    try {
      const base = this.config.gatewayBaseUrl;
      const cfg = await firstValueFrom(this.http.get<{ script: string }>(`${base}/embed/config`));
      await loadTableauScript(cfg.script);
      const { token } = await firstValueFrom(this.http.get<{ token: string }>(`${base}/embed/token`));
      const viz = document.createElement('tableau-viz') as TableauVizElement;
      viz.setAttribute('src', e.src ?? '');
      viz.setAttribute('token', token);
      viz.setAttribute('toolbar', 'hidden');
      viz.setAttribute('hide-tabs', '');
      viz.setAttribute('width', '100%');
      viz.setAttribute('height', '100%');
      for (const [field, values] of Object.entries(e.filtersByCaption ?? {})) {
        const f = document.createElement('viz-filter');
        f.setAttribute('field', field);
        f.setAttribute('value', values.join(','));
        viz.append(f);
      }
      for (const p of e.parameters) {
        const el = document.createElement('viz-parameter');
        el.setAttribute('name', p.tableauName ?? p.caption);
        el.setAttribute('value', String(p.value));
        viz.append(el);
      }
      viz.addEventListener('firstinteractive', () => this.ready());
      viz.addEventListener('vizloaderror', () => this.fail('Tableau refused to show this view. Check the Connected App and its domain allowlist.'));
      this.host().nativeElement.replaceChildren(viz);
      this.driver = new RealVizDriver(viz);
    } catch (err) {
      this.fail(err instanceof Error ? err.message : 'Tableau could not be reached.');
    }
  }

  private ready(): void {
    if (this.timer) clearTimeout(this.timer);
    this.state.set('ready');
    const p = this.params();
    if (p) void this.apply(p);
  }

  private async apply(p: Readonly<Record<string, number | string>>): Promise<void> {
    const changes = Object.entries(p).filter(([k, v]) => this.applied[k] !== v);
    if (!changes.length || !this.driver) return;
    this.state.set('updating');
    try {
      for (const [name, value] of changes) {
        const meta = this.embed().parameters.find((x) => x.name === name);
        await this.driver.changeParameterValueAsync(this.embed().mode === 'real' ? (meta?.tableauName ?? meta?.caption ?? name) : name, value);
        this.applied[name] = value;
      }
      this.state.set('ready');
      // a newer value may have arrived while this one was applied
      const latest = this.params();
      if (latest && Object.entries(latest).some(([k, v]) => this.applied[k] !== v)) void this.apply(latest);
    } catch (err) {
      this.fail(err instanceof Error ? err.message : 'The view could not update.');
    }
  }

  private fail(msg: string): void {
    if (this.timer) clearTimeout(this.timer);
    this.error.set(msg);
    this.state.set('error');
  }

  private teardown(): void {
    if (this.timer) clearTimeout(this.timer);
    this.driver?.dispose();
    this.driver = null;
  }
}
