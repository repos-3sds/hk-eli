import { Provider } from '@angular/core';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { GatewayTodayDataSource } from './gateway-today-data-source';
import { MockTodayDataSource } from './mock-today-data-source';
import { TodayDataSource } from './today-data-source';

/** Picks the data source from config, so switching to the real gateway is a config change only. */
export function provideTodayData(): Provider[] {
  return [
    MockTodayDataSource,
    GatewayTodayDataSource,
    {
      provide: TodayDataSource,
      deps: [APP_CONFIG, MockTodayDataSource, GatewayTodayDataSource],
      useFactory: (config: AppConfig, mock: MockTodayDataSource, gateway: GatewayTodayDataSource) =>
        config.dataSource === 'gateway' ? gateway : mock,
    },
  ];
}
