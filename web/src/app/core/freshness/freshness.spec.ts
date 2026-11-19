import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { MockTodayDataSource } from '../data/mock-today-data-source';
import { Freshness } from '../models/today.models';
import { TEST_CONFIG } from '../../testing/test-config';
import { dataClockText, freshnessWarning, priceClockText } from './freshness';

function load(mode: string | null): Promise<Freshness> {
  window.history.replaceState(null, '', mode ? `/?freshness=${mode}` : '/');
  TestBed.configureTestingModule({ providers: [MockTodayDataSource, { provide: APP_CONFIG, useValue: TEST_CONFIG }] });
  return firstValueFrom(TestBed.inject(MockTodayDataSource).getFreshness());
}

describe('Freshness: the two clocks', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('on a normal day shows last close and this morning\'s prices, with no warning', async () => {
    const f = await load(null);
    expect(dataClockText(f)).toBe('Data as of close Mon 2 Nov');
    expect(priceClockText(f)).toBe('Prices 09:05 HKT today');
    expect(freshnessWarning(f)).toBeNull();
  });

  it('when prices are late, labels the old prices with their date and says priced hand-offs wait', async () => {
    const f = await load('late');
    expect(f.state).toBe('prices-late');
    expect(priceClockText(f)).toBe('Prices from Mon 2 Nov 09:05 HKT');
    expect(freshnessWarning(f)).toContain('expected 09:30 HKT');
    expect(freshnessWarning(f)).toContain('priced hand-offs wait');
  });

  it('when the overnight run failed, shows the last good close and no "new today" list', async () => {
    const f = await load('failed');
    expect(f.state).toBe('run-failed');
    expect(dataClockText(f)).toBe('Data as of close Fri 30 Oct');
    expect(freshnessWarning(f)).toContain('no "new today" list');
  });
});
