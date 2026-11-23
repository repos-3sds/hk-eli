import { buildElementSettings } from './element-config';

const DEFAULTS = {
  appName: 'HK ELI Chatbot',
  gatewayBaseUrl: '/api/stork',
  requestTimeoutMs: 20000,
  asOfDate: null,
  timeZone: 'Asia/Hong_Kong',
  marketHolidays: ['2026-12-25'],
};

const attrs = (values: Record<string, string>) => (name: string) => values[name] ?? null;

describe('buildElementSettings', () => {
  it('uses the standalone config as defaults', () => {
    const s = buildElementSettings(DEFAULTS, attrs({}));
    expect(s.config.gatewayBaseUrl).toBe('/api/stork');
    expect(s.role).toBeNull();
    expect(s.startTab).toBe('today');
  });

  it('lets attributes override the defaults and the config file', () => {
    const s = buildElementSettings(
      DEFAULTS,
      attrs({ 'api-base-url': 'https://edge.example/api/hk-eli/', 'time-zone': 'UTC', 'as-of-date': '2026-11-19', 'request-timeout-ms': '5000', role: 'pm', 'user-name': 'Ada Wong', 'start-tab': 'chat' }),
      { timeZone: 'Asia/Singapore', requestTimeoutMs: 1 },
    );
    expect(s.config.gatewayBaseUrl).toBe('https://edge.example/api/hk-eli');
    expect(s.config.timeZone).toBe('UTC');
    expect(s.config.asOfDate).toBe('2026-11-19');
    expect(s.config.requestTimeoutMs).toBe(5000);
    expect(s.role).toBe('pm');
    expect(s.userName).toBe('Ada Wong');
    expect(s.startTab).toBe('chat');
  });

  it('takes values from the config file when there is no attribute', () => {
    const s = buildElementSettings(DEFAULTS, attrs({}), { timeZone: 'Asia/Singapore' });
    expect(s.config.timeZone).toBe('Asia/Singapore');
  });

  it('fails loudly on bad values', () => {
    expect(() => buildElementSettings(DEFAULTS, attrs({ role: 'rm' }))).toThrowError(/role must be wms, pm or tsm/);
    expect(() => buildElementSettings(DEFAULTS, attrs({ 'as-of-date': '19/11/2026' }))).toThrowError(/YYYY-MM-DD/);
    expect(() => buildElementSettings(DEFAULTS, attrs({ 'request-timeout-ms': 'soon' }))).toThrowError(/positive number/);
    expect(() => buildElementSettings({ ...DEFAULTS, gatewayBaseUrl: '' }, attrs({}))).toThrowError(/api-base-url/);
  });

  it('falls back to Today for an unknown start tab', () => {
    expect(buildElementSettings(DEFAULTS, attrs({ 'start-tab': 'ideas' })).startTab).toBe('today');
  });
});
