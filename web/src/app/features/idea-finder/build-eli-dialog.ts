import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { IdeaFinderDataSource } from '../../core/ideas/idea-finder-data-source';
import { CustomEliPrice, CustomEliSpec, IdeaFilters } from '../../core/ideas/idea-finder.models';
import { ALL_TICKERS } from '../../core/ideas/idea-finder-logic';
import { ConcentrationBar } from '../today/shared/concentration-bar';
import { UsdPipe } from '../today/shared/format';

export interface BuildEliData {
  readonly filters: IdeaFilters;
  readonly clientName: string | null;
}

/** What the dialog hands back when the user copies the custom terms. */
export interface BuiltEli {
  readonly spec: CustomEliSpec;
  readonly price: CustomEliPrice;
  readonly title: string;
}

interface Check {
  readonly label: string;
  readonly met: boolean;
}

export const MAX_STOCKS = 3;

/**
 * "Build my own ELI": for when nothing in the warehouse fits. Starts from the user's chips, solves the coupon from an
 * indicative price as the terms change, checks the client's filters and concentration, then hands the terms back
 * to be copied with the internal-only label (live quotes come in MVP2).
 */
@Component({
  selector: 'eli-build-eli-dialog',
  imports: [MatDialogModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatMenuModule, ConcentrationBar, UsdPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './build-eli-dialog.html',
  styleUrl: './build-eli-dialog.scss',
})
export class BuildEliDialog {
  protected readonly data = inject<BuildEliData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<BuildEliDialog, BuiltEli>);
  private readonly source = inject(IdeaFinderDataSource);

  protected readonly tenors = [3, 6, 9, 12];
  protected readonly kis = [55, 60, 65, 70, 75];
  protected readonly strikes = [80, 85, 90, 95, 100];
  protected readonly maxStocks = MAX_STOCKS;

  protected readonly stocks = signal<readonly string[]>(this.data.filters.include.slice(0, MAX_STOCKS));
  protected readonly tenor = signal(this.data.filters.tenorMonths ?? 6);
  protected readonly ki = signal(this.closest(this.kis, this.data.filters.maxKiPct ?? 65));
  protected readonly strike = signal(90);

  /** Stocks the RM can add: not already in, and not on the "leave out" list. */
  protected readonly addable = computed(() => ALL_TICKERS.filter((t) => !this.stocks().includes(t) && !this.data.filters.exclude.includes(t)).sort());

  protected readonly spec = computed<CustomEliSpec>(() => ({
    underlyings: this.stocks(),
    tenorMonths: this.tenor(),
    kiPct: this.ki(),
    strikePct: this.strike(),
    clientId: this.data.filters.clientId,
  }));

  protected readonly price = rxResource({
    params: () => (this.stocks().length ? this.spec() : undefined),
    stream: ({ params }) => this.source.price(params),
  });

  protected readonly title = computed(() => {
    const s = this.stocks();
    return `${s.join(' / ')}${s.length > 1 ? ' worst-of' : ''} · ${this.tenor()}M`;
  });

  /** The RM's own filters, checked against the custom terms. */
  protected readonly checks = computed<Check[]>(() => {
    const p = this.price.hasValue() ? this.price.value() : null;
    const f = this.data.filters;
    const out: Check[] = [];
    if (p && f.minCouponPct !== null) {
      out.push({ label: `Coupon ${p.couponPct}% against your floor of ${f.minCouponPct}%`, met: p.couponPct >= f.minCouponPct });
    }
    if (f.maxKiPct !== null) {
      out.push({ label: `Knock-in ${this.ki()}% against your ceiling of ${f.maxKiPct}%`, met: this.ki() <= f.maxKiPct });
    }
    if (p?.effect) {
      const e = p.effect;
      out.push({ label: `${e.underlying} goes to ${e.toPct.toFixed(1)}% of the book, limit ${e.limitPct}%`, met: e.toPct <= e.limitPct });
    }
    return out;
  });

  protected readonly overLimit = computed(() => {
    const p = this.price.hasValue() ? this.price.value() : null;
    return !!p?.effect && p.effect.toPct > p.effect.limitPct;
  });

  /** Why the copy button is off, or null when it can be pressed. */
  protected readonly blockedBy = computed(() => {
    if (!this.stocks().length) return 'Add at least one stock.';
    if (!this.price.hasValue()) return 'Waiting for the indicative price.';
    if (this.overLimit()) return 'These terms would take the client over a concentration limit. Change a stock to go on.';
    return null;
  });

  protected add(t: string): void {
    this.stocks.update((s) => (s.length < MAX_STOCKS && !s.includes(t) ? [...s, t] : s));
  }

  protected remove(t: string): void {
    this.stocks.update((s) => s.filter((x) => x !== t));
  }

  protected request(): void {
    if (this.blockedBy() || !this.price.hasValue()) {
      return;
    }
    this.ref.close({ spec: this.spec(), price: this.price.value(), title: this.title() });
  }

  private closest(list: readonly number[], v: number): number {
    return [...list].reverse().find((x) => x <= v) ?? list[0];
  }
}
