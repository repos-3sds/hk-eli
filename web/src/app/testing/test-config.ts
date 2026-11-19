import { AppConfig } from '../core/config/app-config';

/** Config for tests: pinned to Tuesday 3 Nov 2026. */
export const TEST_CONFIG: AppConfig = {
  appName: 'HK ELI Chatbot',
  gatewayBaseUrl: '/api/stork',
  requestTimeoutMs: 1000,
  asOfDate: '2026-11-03',
  timeZone: 'Asia/Hong_Kong',
  marketHolidays: ['2026-12-25'],
};
