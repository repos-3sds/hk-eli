/** The HK ELI Chatbot tabs for the launch users. */
export interface WidgetTab {
  readonly path: string;
  readonly label: string;
  readonly icon: string;
  readonly badge?: number;
}

/** Only screens the discovery docs cover (Hawk, 2026-11-20): Today, Chat and the Prompt library. */
export const WIDGET_TABS: readonly WidgetTab[] = [
  { path: 'today', label: 'Today', icon: 'sun' },
  { path: 'chat', label: 'Chat', icon: 'message-square' },
  { path: 'library', label: 'Prompts', icon: 'list-checks' },
];
