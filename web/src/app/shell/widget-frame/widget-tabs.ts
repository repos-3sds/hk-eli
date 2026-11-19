/** The HK ELI Chatbot tabs for the launch users. */
export interface WidgetTab {
  readonly path: string;
  readonly label: string;
  readonly icon: string;
  readonly badge?: number;
}

/**
 * Only screens the discovery docs cover are shown (Hawk, 2026-11-20): the chat, and a Today overview built
 * from the same 12 Tableau views the chat uses. Ideas, Shelf, Update and Alerts go beyond the discovery docs,
 * so they are hidden. Their code stays, so they can come back once the requirements cover them.
 */
export const HIDDEN_TABS: readonly WidgetTab[] = [
  { path: 'ideas', label: 'Ideas', icon: 'lightbulb' },
  { path: 'shelf', label: 'Shelf', icon: 'package' },
  { path: 'update', label: 'Update', icon: 'file-text' },
  { path: 'alerts', label: 'Alerts', icon: 'bell' },
];

export const WIDGET_TABS: readonly WidgetTab[] = [
  { path: 'today', label: 'Today', icon: 'sun' },
  { path: 'chat', label: 'Chat', icon: 'message-square' },
  { path: 'library', label: 'Prompts', icon: 'list-checks' },
];
