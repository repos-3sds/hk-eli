import { Provider } from '@angular/core';
import { ChatDataSource } from './chat-data-source';
import { StorkChatDataSource } from './stork-chat-data-source';

/** Every answer comes from the agent: the Python Stork pipeline over the HK_ELI Tableau views. */
export function provideChatData(): Provider[] {
  return [StorkChatDataSource, { provide: ChatDataSource, useExisting: StorkChatDataSource }];
}
