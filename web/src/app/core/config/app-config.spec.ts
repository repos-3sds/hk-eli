import { loadAppConfig, parseAppConfig } from './app-config';
import { TEST_CONFIG } from '../../testing/test-config';

describe('app config', () => {
  it('accepts a complete config', () => {
    expect(parseAppConfig({ ...TEST_CONFIG }).gatewayBaseUrl).toBe('/api/stork');
  });

  it('defaults asOfDate to null', () => {
    const { asOfDate: _drop, ...rest } = TEST_CONFIG;
    expect(parseAppConfig(rest).asOfDate).toBeNull();
  });

  it('names the missing keys', () => {
    const { gatewayBaseUrl: _a, timeZone: _b, ...rest } = TEST_CONFIG;
    expect(() => parseAppConfig(rest)).toThrow(/gatewayBaseUrl, timeZone/);
  });

  it('fails loudly when the file cannot be fetched', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(loadAppConfig(fetchFn as unknown as typeof fetch)).rejects.toThrow(/404/);
  });
});
