import { AppConfig } from '../core/config/app-config';

/** Config for tests: pinned to Tuesday 3 Nov 2026, no latency. */
export const TEST_CONFIG: AppConfig = {
  appName: 'HK ELI Chatbot',
  dataSource: 'mock',
  gatewayBaseUrl: '/api/hk-eli',
  requestTimeoutMs: 1000,
  mockLatencyMs: 0,
  mockScenario: 'normal',
  asOfDate: '2026-11-03',
  timeZone: 'Asia/Hong_Kong',
  businessDaysAhead: 10,
  marketHolidays: ['2026-12-25'],
  briefLeadLimit: 3,
  signalsTotal: 6,
  concentrationWarnRatio: 0.85,
  maturingWindowBusinessDays: 10,
};
