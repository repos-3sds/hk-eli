import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { FIXTURE_CLIENTS } from '../../core/data/today.fixture';
import { ALL_TICKERS } from '../../core/ideas/idea-finder-logic';
import { IdeaFinderStore } from './idea-finder.store';

/**
 * "Narrow your focus": the hard filters as chips. Every filter can be set here without typing a sentence,
 * and every chip can be changed in place. Hard filters remove ideas; they never count as signals.
 */
@Component({
  selector: 'eli-focus-chips',
  imports: [MatIconModule, MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'group', 'aria-labelledby': 'focus-label' },
  templateUrl: './focus-chips.html',
  styleUrl: './focus-chips.scss',
})
export class FocusChips {
  protected readonly store = inject(IdeaFinderStore);
  protected readonly f = this.store.filters;
  protected readonly clients = FIXTURE_CLIENTS;
  protected readonly tickers = [...ALL_TICKERS].sort();
  protected readonly tenors = [3, 6, 9, 12];
  protected readonly coupons = [8, 10, 12, 15, 18, 20];
  protected readonly kis = [55, 60, 65, 70, 75];

  protected readonly anySet = computed(() => {
    const f = this.f();
    return f.tenorMonths !== null || f.minCouponPct !== null || f.maxKiPct !== null || f.include.length > 0 || f.exclude.length > 0;
  });
}
