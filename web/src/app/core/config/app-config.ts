import { InjectionToken } from '@angular/core';

/** Where the Today data comes from. `mock` uses the in-browser fixtures; `gateway` calls the API gateway. */
export type DataSourceKind = 'mock' | 'gateway';

/** Mock scenarios, so every state of the flow can be seen without a back end. */
export type MockScenario = 'normal' | 'empty' | 'error' | 'slow';

/**
 * Runtime configuration, loaded from `config/app-config.json` before the app starts.
 * Nothing here is hardcoded in components: URLs, limits, windows and thresholds all live in the file.
 */
export interface AppConfig {
  readonly appName: string;
  readonly dataSource: DataSourceKind;
  readonly gatewayBaseUrl: string;
  readonly requestTimeoutMs: number;
  readonly mockLatencyMs: number;
  readonly mockScenario: MockScenario;
  /** ISO date (YYYY-MM-DD) to pin "today" for demos; null means the real date in `timeZone`. */
  readonly asOfDate: string | null;
  readonly timeZone: string;
  readonly businessDaysAhead: number;
  readonly marketHolidays: readonly string[];
  readonly briefLeadLimit: number;
  readonly signalsTotal: number;
  /** Share of a client's limit at which a concentration bar turns to the warning colour. */
  readonly concentrationWarnRatio: number;
  readonly maturingWindowBusinessDays: number;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

export const CONFIG_URL = 'config/app-config.json';

const REQUIRED_KEYS: readonly (keyof AppConfig)[] = [
  'appName',
  'dataSource',
  'gatewayBaseUrl',
  'requestTimeoutMs',
  'mockLatencyMs',
  'mockScenario',
  'timeZone',
  'businessDaysAhead',
  'marketHolidays',
  'briefLeadLimit',
  'signalsTotal',
  'concentrationWarnRatio',
  'maturingWindowBusinessDays',
];

/** Checks the loaded file. A broken config fails loudly at start-up rather than silently later. */
export function parseAppConfig(raw: unknown): AppConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('App config is not an object');
  }
  const value = raw as Record<string, unknown>;
  const missing = REQUIRED_KEYS.filter((key) => value[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`App config is missing: ${missing.join(', ')}`);
  }
  if (value['dataSource'] !== 'mock' && value['dataSource'] !== 'gateway') {
    throw new Error(`App config dataSource must be "mock" or "gateway"`);
  }
  return { asOfDate: null, ...value } as unknown as AppConfig;
}

/** Fetches the config file. Used by main.ts before bootstrap. */
export async function loadAppConfig(fetchFn: typeof fetch = fetch): Promise<AppConfig> {
  const response = await fetchFn(CONFIG_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not load ${CONFIG_URL}: ${response.status}`);
  }
  return parseAppConfig(await response.json());
}
