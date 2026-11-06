/**
 * Exports the demo fixtures to JSON seed files for the gateway, so the web mock and the gateway serve the
 * same invented business. Run: npm run export-seed (writes ../gateway/src/main/resources/seed/).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BOOK_CONCENTRATION, CLIENT_OWNERS, ROLLOVER_BASELINE_PCT, ROLLOVER_POCKETS, UNMET_DEMAND } from '../src/app/core/data/business.fixture';
import { FIXTURE_CLIENTS, FIXTURE_IDEAS, FIXTURE_LEADS, FIXTURE_MOMENTS, SIGNAL_CATALOGUE } from '../src/app/core/data/today.fixture';
import { CONCENTRATION_LIMIT_PCT, DEFAULT_NOTIONAL_USD, IDEA_SIGNALS, SIGNAL_GROUPS, STARTER_PACKS, WAREHOUSE } from '../src/app/core/ideas/idea-warehouse.fixture';
import { ALL_TICKERS, TICKER_VOL } from '../src/app/core/ideas/idea-finder-logic';
import { BUSINESS_ROWS } from '../src/app/core/update/business-update';
import { DISTRICT_OF_BRANCH } from '../src/app/core/models/scope';

const out = process.argv[2] ?? '../gateway/src/main/resources/seed';
mkdirSync(out, { recursive: true });
const write = (name: string, value: unknown) => writeFileSync(join(out, `${name}.json`), JSON.stringify(value, null, 2) + '\n');

write('today', {
  signalCatalogue: SIGNAL_CATALOGUE,
  clients: FIXTURE_CLIENTS,
  owners: CLIENT_OWNERS,
  moments: FIXTURE_MOMENTS,
  leads: FIXTURE_LEADS,
  ideaSets: FIXTURE_IDEAS,
});
write('business', {
  rolloverBaselinePct: ROLLOVER_BASELINE_PCT,
  pockets: ROLLOVER_POCKETS,
  rows: BUSINESS_ROWS,
  unmetDemand: UNMET_DEMAND,
  bookConcentration: BOOK_CONCENTRATION,
  districtOfBranch: DISTRICT_OF_BRANCH,
});
write('ideas', {
  concentrationLimitPct: CONCENTRATION_LIMIT_PCT,
  defaultNotionalUsd: DEFAULT_NOTIONAL_USD,
  tickers: ALL_TICKERS,
  tickerVol: TICKER_VOL,
  warehouse: WAREHOUSE,
  signals: IDEA_SIGNALS,
  signalGroups: SIGNAL_GROUPS,
  starterPacks: STARTER_PACKS,
});
console.log(`Seed written to ${out}`);
