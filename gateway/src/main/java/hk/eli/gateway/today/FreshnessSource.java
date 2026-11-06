package hk.eli.gateway.today;

import hk.eli.gateway.today.TodayModels.Freshness;

/**
 * The two clocks (R37): the overnight data refresh and this morning's pricing. In production this reads the
 * run log of the overnight batch and the pricing job; the demo source below derives it from the business clock.
 */
public interface FreshnessSource {
  Freshness current();
}
