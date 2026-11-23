import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TableauEmbed } from '../../core/chat/chat.models';
import { TableauViz } from '../../core/tableau/tableau-viz';

/** Captions as the HK_ELI workbook shows them, so the chips read like Tableau's own filter cards. */
const CAPTION: Record<string, string> = {
  deal_status: 'Deal Status', bp_div_type: 'Segment', cust_district: 'District', cust_branch: 'Branch', wps: 'WPS',
  predict_result: 'Predicted result', predict_maturity: 'Predicted maturity', days_to_pred_maturity: 'Days to predicted maturity',
  in_shock_basket: 'Holds the shocked stock',
};
const SEG: Record<string, string> = { 'Treasures(HK)': 'TRE', 'Treasures(TPC)': 'TPC', PB: 'PB' };

export interface FilterChip {
  readonly label: string;
  readonly value: string;
}

/** One chip per filter, in the user's words: "District D1", "Predicted maturity next 60 days". */
export function filterChips(filters: Readonly<Record<string, readonly string[]>>, ticker?: string | null): FilterChip[] {
  const out: FilterChip[] = [];
  for (const [f, vals] of Object.entries(filters)) {
    const flag = /^in_n(\d+)$/.exec(f);
    if (flag) {
      out.push({ label: 'Predicted maturity', value: `next ${flag[1]} days` });
    } else if (f === 'in_shock_basket') {
      out.push({ label: 'Basket holds', value: ticker ?? 'the shocked stock' });
    } else if (f === 'predict_maturity' && vals.length > 3) {
      out.push({ label: 'Predicted maturity', value: `${vals.length} dates` });
    } else {
      const shown = vals.map((v) => SEG[v] ?? v.replace('TRE-', ''));
      out.push({ label: CAPTION[f] ?? f, value: shown.length > 3 ? `${shown.length} values` : shown.join(', ') });
    }
  }
  return out;
}

/**
 * Every Tableau view about the answer's topic, each live and filtered with the same filter spec the answer used.
 * A view that can't take a filter says so on the view; a view that can't take the scope at all is listed, not shown.
 * In a what-if, the slider drives the views' parameters at runtime (Market Spot, or Shock % on the W8 sheet).
 */
@Component({
  selector: 'eli-tableau-views',
  imports: [MatIconModule, TableauViz],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="views" [class.tabbed]="tabbed()" aria-label="Tableau views for this topic">
      @if (!tabbed()) {
      <header class="vhead">
        <button type="button" class="toggle" [attr.aria-expanded]="open()" (click)="open.set(!open())">
          <mat-icon [svgIcon]="open() ? 'chevron-down' : 'chevron-right'" aria-hidden="true" />
          <span class="title">Tableau views for this topic</span>
        </button>
        <span class="count">{{ live().length }} {{ live().length === 1 ? 'view' : 'views' }} · same filters{{ bound() ? ' · follow the slider' : '' }}</span>
      </header>
      }
      @if (open() || tabbed()) {
        @if (chips().length) {
          <div class="chips" role="list" aria-label="Filters on every view">
            <span class="chips-label">Filters on every view</span>
            @for (c of chips(); track c.label) {<span class="chip" role="listitem">{{ c.label }} <b>{{ c.value }}</b></span>}
          </div>
        }
        @if (live().length > 1) {
          <div class="vtabs" role="tablist" aria-label="Views">
            @for (e of live(); track e.recordId) {
              <button type="button" role="tab" class="vtab" [class.on]="current() === e.recordId" [attr.aria-selected]="current() === e.recordId"
                (click)="pick.set(e.recordId)" [title]="e.title">
                @if (e.role === 'primary') {<span class="dot" aria-hidden="true"></span>}{{ short(e) }}
              </button>
            }
          </div>
        }
        @for (e of live(); track e.recordId) {
          <article class="view" role="tabpanel" [hidden]="live().length > 1 && current() !== e.recordId">
            <div class="vrow">
              <span class="role" [class.main]="e.role === 'primary'">{{ e.role === 'primary' ? 'Answer view' : 'Related' }}</span>
              <span class="vtitle" [title]="e.title">{{ e.title }}</span>
              <code class="vname">{{ e.view }}</code>
              @if (link(e); as href) {
                <a class="open" [href]="href" target="_blank" rel="noopener" [attr.aria-label]="'Open ' + e.view + ' in Tableau'">Open<mat-icon svgIcon="external-link" aria-hidden="true" /></a>
              }
            </div>
            @if (e.parameters.length) {
              <p class="note param">
                @for (p of e.parameters; track p.name) {
                  @if (p.name !== 'shock_ticker' || p.value) {<span class="pchip">{{ p.caption }} <b>{{ paramValue(e, p.name, p.value) }}</b></span>}
                }
                @if (e.bind) {<span class="muted">· moves with the slider</span>}
              </p>
            }
            @if (e.cannotApply.length) {
              <p class="note warn"><mat-icon svgIcon="circle-alert" aria-hidden="true" />This view can't filter by {{ captions(e.cannotApply) }}, so it shows a wider scope than the answer.</p>
            }
            @for (n of e.notes; track n) {<p class="note"><mat-icon svgIcon="info" aria-hidden="true" />{{ n }}</p>}
            @if (e.presentation === 'link') {
              <p class="note">Live embedding is switched off here; open the view in Tableau.</p>
            } @else {
              <eli-tableau-viz [embed]="e" [params]="paramsFor(e)" [height]="heightFor(e)" />
            }
          </article>
        }
        @for (e of skipped(); track e.recordId) {
          <p class="skip"><mat-icon svgIcon="info" aria-hidden="true" /><span><b>{{ e.title }}</b> is not shown: {{ e.whyNot }}</span></p>
        }
      }
    </section>
  `,
  styleUrl: './tableau-views.scss',
})
export class TableauViews {
  readonly embeds = input.required<readonly TableauEmbed[]>();
  /** The what-if slider's level (a move, e.g. -0.10), or null outside a what-if. */
  readonly move = input<number | null>(null);
  readonly ticker = input<string | null>(null);

  /** Inside a what-if tab: one view at a time behind its own tabs, no collapsible header. */
  readonly tabbed = input(false);

  protected readonly open = signal(true);
  protected readonly pick = signal<string | null>(null);
  /** The picked view; hidden views stay loaded so the slider keeps them in step. */
  protected readonly current = computed(() => {
    const ids = this.live().map((e) => e.recordId);
    const p = this.pick();
    return p && ids.includes(p) ? p : (ids[0] ?? null);
  });
  protected readonly live = computed(() => this.embeds().filter((e) => !e.skipped));
  protected readonly skipped = computed(() => this.embeds().filter((e) => e.skipped));
  protected readonly bound = computed(() => this.move() !== null && this.live().some((e) => e.bind));
  /** The filters the answer's primary view applies; related views show their own differences as notes. */
  protected readonly chips = computed(() => {
    const first = this.live()[0];
    return first ? filterChips(first.filters, this.ticker()) : [];
  });

  /** A short tab label from the view title: "WPS exposure, any segment, any window (...)" -> "WPS exposure". */
  protected short(e: TableauEmbed): string {
    return e.title.split(/[:,(]/)[0].trim() || e.view;
  }

  protected paramsFor(e: TableauEmbed): Record<string, number | string> | null {
    const m = this.move();
    if (m === null || !e.bind) return null;
    return e.bind === 'shock_pct' ? { shock_pct: Math.round(m * 100) / 100 } : { market_spot: Math.round((1 + m) * 100) / 100 };
  }

  protected paramValue(e: TableauEmbed, name: string, value: number | string): string {
    const live = this.paramsFor(e)?.[name] ?? value;
    if (name === 'market_spot') return `${Math.round(Number(live) * 100)}%`;
    if (name === 'shock_pct') {
      const pct = Math.round(Number(live) * 100);
      return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%`;
    }
    return String(live);
  }

  /** Tall enough that a bubble chart or a scenario table shows without cropping. */
  protected heightFor(e: TableauEmbed): number {
    if (e.recordId === 'position-scenario-all') return 400;
    return e.vizKind === 'bubble' ? 440 : 320;
  }

  protected captions(fields: readonly string[]): string {
    return fields.map((f) => (CAPTION[f] ?? f).toLowerCase()).join(', ');
  }

  protected link(e: TableauEmbed): string | null {
    if (e.mode === 'real' && e.src) {
      const qs = new URLSearchParams(Object.entries(e.filtersByCaption ?? {}).map(([k, v]) => [k, v.join(',')]));
      return e.src + (qs.toString() ? `?${qs}` : '');
    }
    return e.url ?? null;
  }
}
