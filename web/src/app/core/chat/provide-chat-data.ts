import { Provider } from '@angular/core';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { ChatDataSource } from './chat-data-source';
import { GatewayChatDataSource } from './gateway-chat-data-source';
import { MockChatDataSource } from './mock-chat-data-source';

/** Same switch as the Today data: `dataSource` in config picks mock or gateway. */
export function provideChatData(): Provider[] {
  return [
    MockChatDataSource,
    GatewayChatDataSource,
    {
      provide: ChatDataSource,
      deps: [APP_CONFIG, MockChatDataSource, GatewayChatDataSource],
      useFactory: (config: AppConfig, mock: MockChatDataSource, gateway: GatewayChatDataSource) =>
        config.dataSource === 'gateway' ? gateway : mock,
    },
  ];
}
