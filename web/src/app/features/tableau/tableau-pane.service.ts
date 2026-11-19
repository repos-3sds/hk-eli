import { Injectable, signal } from '@angular/core';

/** What the split pane needs to show one Tableau view with the answer's filters (from the pipeline's embed block). */
export interface PaneView {
  readonly view: string;
  /** Mock Tableau page (proxied /tableau/...), filters in the query string. */
  readonly url: string;
  /** Real Tableau view URL for <tableau-viz>, when the server runs TABLEAU_MODE=real. */
  readonly src?: string;
  readonly mode?: string;
  readonly filtersByCaption?: Readonly<Record<string, readonly string[]>>;
  readonly highlight?: readonly string[];
  readonly highlightCaption?: string;
  /** Short scope line, e.g. "TRE · predicted maturity next 30 days". */
  readonly scope?: string;
}

/** The Tableau split view beside Chat. Kept app-wide so Today can open Chat with the pane already showing. */
@Injectable({ providedIn: 'root' })
export class TableauPaneService {
  readonly view = signal<PaneView | null>(null);
  /** Pane width in px; the divider drags it. */
  readonly width = signal(520);

  open(v: PaneView): void {
    this.view.set(v);
  }

  close(): void {
    this.view.set(null);
  }
}
