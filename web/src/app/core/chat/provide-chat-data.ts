import { Provider } from '@angular/core';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { ChatDataSource } from './chat-data-source';
import { GatewayChatDataSource } from './gateway-chat-data-source';
import { MockChatDataSource } from './mock-chat-data-source';
import { StorkChatDataSource } from './stork-chat-data-source';

/** `dataSource` in config picks mock, gateway, or the Python Stork pipeline over the HK_ELI Tableau views. */
export function provideChatData(): Provider[] {
  return [
    MockChatDataSource,
    GatewayChatDataSource,
    StorkChatDataSource,
    {
      provide: ChatDataSource,
      deps: [APP_CONFIG, MockChatDataSource, GatewayChatDataSource, StorkChatDataSource],
      useFactory: (config: AppConfig, mock: MockChatDataSource, gateway: GatewayChatDataSource, stork: StorkChatDataSource) =>
        config.dataSource === 'stork' ? stork : config.dataSource === 'gateway' ? gateway : mock,
    },
  ];
}
