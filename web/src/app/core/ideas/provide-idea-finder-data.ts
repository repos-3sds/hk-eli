import { Provider } from '@angular/core';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { GatewayIdeaFinderDataSource } from './gateway-idea-finder-data-source';
import { IdeaFinderDataSource } from './idea-finder-data-source';
import { MockIdeaFinderDataSource } from './mock-idea-finder-data-source';

export function provideIdeaFinderData(): Provider[] {
  return [
    MockIdeaFinderDataSource,
    GatewayIdeaFinderDataSource,
    {
      provide: IdeaFinderDataSource,
      deps: [APP_CONFIG, MockIdeaFinderDataSource, GatewayIdeaFinderDataSource],
      useFactory: (config: AppConfig, mock: MockIdeaFinderDataSource, gateway: GatewayIdeaFinderDataSource) =>
        config.dataSource === 'gateway' ? gateway : mock,
    },
  ];
}
