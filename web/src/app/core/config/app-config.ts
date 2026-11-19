import { InjectionToken } from '@angular/core';

/**
 * Runtime configuration, loaded from `config/app-config.json` before the app starts.
 * Nothing here is hardcoded in components: URLs, limits, windows and thresholds all live in the file.
 */
export interface AppConfig {
  readonly appName: string;
  /** The agent's API: the Python Stork pipeline (proxied as /api/stork in development). */
  readonly gatewayBaseUrl: string;
  readonly requestTimeoutMs: number;
  /** ISO date (YYYY-MM-DD) to pin "today" for demos; null means the real date in `timeZone`. */
  readonly asOfDate: string | null;
  readonly timeZone: string;
  readonly marketHolidays: readonly string[];
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

export const CONFIG_URL = 'config/app-config.json';

const REQUIRED_KEYS: readonly (keyof AppConfig)[] = ['appName', 'gatewayBaseUrl', 'requestTimeoutMs', 'timeZone', 'marketHolidays'];

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
