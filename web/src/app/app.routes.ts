import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'rm/today' },
  {
    path: 'rm',
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'today' },
      {
        path: 'today',
        title: 'Today · HK ELI Chatbot',
        loadComponent: () => import('./features/today/today-layout').then((m) => m.TodayLayout),
        children: [
          { path: '', loadComponent: () => import('./features/today/brief/brief-page').then((m) => m.BriefPage) },
          // Older links to a client's ideas now open the Ideas tab with that client picked.
          { path: 'ideas/:clientId', redirectTo: ({ params }) => `/rm/ideas?client=${encodeURIComponent(params['clientId'])}` },
        ],
      },
      {
        path: 'chat',
        title: 'Chat · HK ELI Chatbot',
        loadComponent: () => import('./features/chat/chat-page').then((m) => m.ChatPage),
      },
      {
        path: 'ideas',
        title: 'Ideas · HK ELI Chatbot',
        loadComponent: () => import('./features/idea-finder/idea-finder-page').then((m) => m.IdeaFinderPage),
      },
      {
        path: 'update',
        title: 'Update · HK ELI Chatbot',
        loadComponent: () => import('./features/placeholder/tab-placeholder').then((m) => m.TabPlaceholder),
        data: { title: 'Update', icon: 'file-text', purpose: 'The scheduled Business Update, section by section.' },
      },
      {
        path: 'alerts',
        title: 'Alerts · HK ELI Chatbot',
        loadComponent: () => import('./features/placeholder/tab-placeholder').then((m) => m.TabPlaceholder),
        data: { title: 'Alerts', icon: 'bell', purpose: 'Plain-word rules, quiet hours and call lists.' },
      },
    ],
  },
  { path: '**', redirectTo: 'rm/today' },
];
