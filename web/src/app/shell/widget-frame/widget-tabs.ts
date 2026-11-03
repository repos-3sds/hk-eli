/** The HK ELI Chatbot tabs for the RM view (Moment Console). */
export interface WidgetTab {
  readonly path: string;
  readonly label: string;
  readonly icon: string;
  readonly badge?: number;
}

export const RM_TABS: readonly WidgetTab[] = [
  { path: 'today', label: 'Today', icon: 'sun' },
  { path: 'chat', label: 'Chat', icon: 'message-square' },
  { path: 'ideas', label: 'Ideas', icon: 'lightbulb' },
  { path: 'update', label: 'Update', icon: 'file-text' },
  { path: 'alerts', label: 'Alerts', icon: 'bell', badge: 3 },
];
