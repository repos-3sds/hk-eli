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
          {
            path: 'ideas/:clientId',
            title: 'Ideas · HK ELI Chatbot',
            loadComponent: () => import('./features/today/ideas/ideas-page').then((m) => m.IdeasPage),
          },
        ],
      },
      {
        path: 'chat',
        title: 'Chat · HK ELI Chatbot',
        loadComponent: () => import('./features/placeholder/tab-placeholder').then((m) => m.TabPlaceholder),
        data: { title: 'Chat', icon: 'message-square', purpose: 'Ask about a client, an underlying or an idea. Answers carry a trust line and saved questions. Built next.' },
      },
      {
        path: 'ideas',
        title: 'Ideas · HK ELI Chatbot',
        loadComponent: () => import('./features/placeholder/tab-placeholder').then((m) => m.TabPlaceholder),
        data: { title: 'Ideas', icon: 'lightbulb', purpose: 'Plain words become parameter chips, then the top five ideas with their concentration effect.' },
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
