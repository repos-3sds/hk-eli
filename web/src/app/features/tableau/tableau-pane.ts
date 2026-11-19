import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, output, signal, untracked, viewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../../core/config/app-config';
import { PaneView, TableauPaneService } from './tableau-pane.service';

interface EmbedConfig { readonly mode: string; readonly script?: string; readonly site?: string }

/**
 * The split view: the Tableau view behind an answer, beside the chat, with the same filters (POC's pane.js).
 * Mock mode: an iframe to the mock Tableau page. Real mode: Embedding API v3 <tableau-viz> with a Connected App
 * token for the user, the answer's marks highlighted, and a clicked mark offered back as the next question.
 */
@Component({
  selector: 'eli-tableau-pane',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pane.view(); as v) {
      <header class="head">
        <span class="label">{{ live() ? 'Live Tableau' : 'Mock Tableau' }}</span>
        <b class="name" [title]="v.view">{{ v.view }}</b>
        <a class="icon" [href]="v.src ?? v.url" target="_blank" rel="noopener" title="Open in a new browser tab" aria-label="Open in a new browser tab"><mat-icon svgIcon="external-link" /></a>
        <button type="button" class="icon" title="Close the Tableau view" aria-label="Close the Tableau view" (click)="pane.close()"><mat-icon svgIcon="x" /></button>
      </header>
      @if (v.scope || filterText(v)) {
        <p class="filters">{{ v.scope }}@if (v.scope && filterText(v)) { · }{{ filterText(v) }}</p>
      }
      <div class="host" #host>
        @if (!live() && frameUrl(); as u) {
          <iframe [src]="u" title="Tableau view behind the answer"></iframe>
        }
        @if (status(); as s) {
          <div class="status"><b>{{ s.title }}</b>@if (s.detail) {<span>{{ s.detail }}</span>}</div>
        }
      </div>
      @if (offer(); as q) {
        <button type="button" class="offer" (click)="askOffer(q)"><mat-icon svgIcon="sparkles" aria-hidden="true" />Ask: {{ q }}</button>
      }
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-width: 0; height: 100%; background: var(--eli-bg-dock); border-left: 1px solid var(--eli-separator); }
    .head { display: flex; align-items: center; gap: var(--eli-space-5); flex: none; height: 48px; padding: 0 var(--eli-space-5) 0 var(--eli-space-7); border-bottom: 1px solid var(--eli-separator); }
    .label { flex: none; color: var(--eli-accent-orange); font-size: var(--eli-font-size-xs); font-weight: var(--eli-weight-semibold); letter-spacing: 0.06em; text-transform: uppercase; }
    .name { flex: 1; min-width: 0; overflow: hidden; color: var(--eli-text-strong); font-family: ui-monospace, Menlo, monospace; font-size: var(--eli-font-size-s); font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
    .icon { display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: var(--eli-radius-s); background: none; color: var(--eli-text-muted); cursor: pointer; &:hover { background: var(--eli-bg-row); color: var(--eli-text-strong); } mat-icon { width: 16px; height: 16px; } }
    .filters { flex: none; margin: 0; padding: var(--eli-space-4) var(--eli-space-7); border-bottom: 1px solid var(--eli-separator); color: var(--eli-text-muted); font-size: var(--eli-font-size-xs); overflow-wrap: anywhere; }
    .host { position: relative; flex: 1; min-height: 0; background: #fff; }
    iframe, tableau-viz { display: block; width: 100%; height: 100%; border: 0; }
    .status { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--eli-space-3); padding: var(--eli-space-8); background: var(--eli-bg-dock); color: var(--eli-text-strong); text-align: center; span { color: var(--eli-text-muted); font-size: var(--eli-font-size-s); } }
    .offer { flex: none; display: flex; align-items: center; gap: var(--eli-space-4); margin: var(--eli-space-5) var(--eli-space-7); padding: var(--eli-space-4) var(--eli-space-6); border: 1px solid var(--eli-border); border-radius: var(--eli-radius-pill); background: none; color: var(--eli-text-primary); font: inherit; font-size: var(--eli-font-size-s); text-align: left; cursor: pointer; &:hover { border-color: var(--eli-accent-link); } mat-icon { width: 14px; height: 14px; color: var(--eli-accent-link); } }
  `,
})
export class TableauPane {
  protected readonly pane = inject(TableauPaneService);
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly host = viewChild<ElementRef<HTMLElement>>('host');

  /** A question to ask from a clicked mark (real Tableau only). */
  readonly ask = output<string>();

  protected readonly live = signal(false);
  protected readonly frameUrl = signal<SafeResourceUrl | null>(null);
  protected readonly status = signal<{ title: string; detail?: string } | null>(null);
  protected readonly offer = signal<string | null>(null);
  private embedConfig: Promise<EmbedConfig> | null = null;
  private script: Promise<void> | null = null;

  constructor() {
    effect(() => {
      const v = this.pane.view();
      const host = this.host();
      if (!v || !host) return;
      untracked(() => void this.show(v, host.nativeElement));
    });
  }

  protected filterText(v: PaneView): string {
    const f = Object.entries(v.filtersByCaption ?? {});
    if (f.length) return 'Filters: ' + f.map(([k, vals]) => `${k} = ${vals.join(', ')}`).join('; ');
    const q = v.url.split('?')[1];
    if (!q) return '';
    const parts = new URLSearchParams(q);
    const shown = [...parts.entries()].filter(([k]) => !k.startsWith(':')).map(([k, val]) => `${k} = ${val}`);
    return shown.length ? 'Filters: ' + shown.join('; ') : '';
  }

  protected askOffer(q: string): void {
    this.offer.set(null);
    this.ask.emit(q);
  }

  private async show(v: PaneView, host: HTMLElement): Promise<void> {
    this.offer.set(null);
    this.status.set(null);
    host.querySelector('tableau-viz')?.remove();
    const c = await this.loadConfig();
    if (c.mode === 'real' && v.mode === 'real' && v.src && c.script) {
      this.live.set(true);
      await this.showReal(v, host, c.script);
    } else {
      this.live.set(false);
      this.frameUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(v.url));
    }
  }

  private loadConfig(): Promise<EmbedConfig> {
    this.embedConfig ??= firstValueFrom(this.http.get<EmbedConfig>(`${this.config.gatewayBaseUrl}/embed/config`)).catch(() => ({ mode: 'mock' }));
    return this.embedConfig;
  }

  private loadScript(src: string): Promise<void> {
    this.script ??= new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.type = 'module';
      s.src = src;
      s.onload = () => customElements.whenDefined('tableau-viz').then(() => resolve());
      s.onerror = () => reject(new Error(`Tableau's embedding script didn't load from ${src}`));
      document.head.append(s);
    });
    return this.script;
  }

  private async showReal(v: PaneView, host: HTMLElement, script: string): Promise<void> {
    this.status.set({ title: 'Loading the Tableau view…' });
    try {
      await this.loadScript(script);
    } catch (e) {
      this.status.set({ title: "Couldn't load Tableau.", detail: `${(e as Error).message}. Check that this browser can reach your Tableau site.` });
      return;
    }
    let token: string;
    try {
      token = (await firstValueFrom(this.http.get<{ token: string }>(`${this.config.gatewayBaseUrl}/embed/token`))).token;
    } catch {
      this.status.set({ title: "Couldn't get a sign-in token for Tableau.", detail: "The chatbot service didn't return one." });
      return;
    }
    // <tableau-viz> is Tableau's own web component, so it is built with the DOM, as in the POC's pane.js.
    const viz = document.createElement('tableau-viz') as HTMLElement & { workbook?: any };
    viz.setAttribute('src', v.src!);
    viz.setAttribute('token', token);
    viz.setAttribute('toolbar', 'hidden');
    viz.setAttribute('hide-tabs', '');
    viz.setAttribute('width', '100%');
    viz.setAttribute('height', '100%');
    for (const [field, values] of Object.entries(v.filtersByCaption ?? {})) {
      const f = document.createElement('viz-filter');
      f.setAttribute('field', field);
      f.setAttribute('value', values.join(','));
      viz.append(f);
    }
    viz.addEventListener('firstinteractive', async () => {
      this.status.set(null);
      if (v.highlight?.length && v.highlightCaption) {
        try {
          await viz.workbook.activeSheet.selectMarksByValueAsync([{ fieldName: v.highlightCaption, value: v.highlight }], 'select-replace');
        } catch {
          /* highlight is a nicety */
        }
      }
    });
    viz.addEventListener('markselectionchanged', async (ev: any) => {
      try {
        const marks = await ev.detail.getMarksAsync();
        const t = marks.data?.[0];
        if (!t?.data.length) return;
        const row = Object.fromEntries(t.columns.map((col: any, i: number) => [col.fieldName, t.data[0][i].formattedValue])) as Record<string, string>;
        this.offer.set(markQuestion(row));
      } catch {
        /* ignore */
      }
    });
    viz.addEventListener('vizloaderror', () => {
      this.status.set({ title: 'Tableau refused to show this view.', detail: 'Check the view exists in the workbook, the Connected App is enabled, and its domain allowlist includes this site.' });
    });
    host.append(viz);
  }
}

/** A clicked mark becomes a follow-up the pipeline understands (a hint only, never evidence). Same rules as pane.js. */
export function markQuestion(row: Record<string, string>): string | null {
  if (row['Cust Branch']) return `Show the clients behind ${row['Cust Branch']} maturing in the next 30 days`;
  if (row['Predict Maturity']) {
    const d = new Date(row['Predict Maturity']);
    if (!isNaN(d.getTime())) return `Give me the client and RM list for the ${d.getDate()} ${d.toLocaleString('en', { month: 'short' })} maturity`;
  }
  if (row['Cust District'] && row['Cust District'] !== 'Null') return `Which branches in ${row['Cust District'].replace('TRE-', '')} have the largest TRE maturity in the next 30 days?`;
  if (row['Wps']) return `Show me the distribution on ${row['Wps']}`;
  return null;
}
