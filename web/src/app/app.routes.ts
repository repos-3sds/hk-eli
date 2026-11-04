import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';

/**
 * The widget's tabs. Launch users are GFM WMS, CBG PM and CBG TSM, so routes no longer carry an "rm" prefix.
 * Old /rm/... links (walkthroughs, bookmarks) redirect to the same tab, keeping their query.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'today' },
  {
    path: 'today',
    title: 'Today · HK ELI Chatbot',
    loadComponent: () => import('./features/today/today-layout').then((m) => m.TodayLayout),
    children: [
      { path: '', loadComponent: () => import('./features/today/brief/brief-page').then((m) => m.BriefPage) },
      // Older links to a client's ideas now open the Ideas tab with that client picked.
      { path: 'ideas/:clientId', redirectTo: ({ params }) => `/ideas?client=${encodeURIComponent(params['clientId'])}` },
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
    loadComponent: () => import('./features/update/business-update-page').then((m) => m.BusinessUpdatePage),
  },
  {
    path: 'alerts',
    title: 'Alerts · HK ELI Chatbot',
    loadComponent: () => import('./features/placeholder/tab-placeholder').then((m) => m.TabPlaceholder),
    data: { title: 'Alerts', icon: 'bell', purpose: 'Plain-word rules, quiet hours and hand-off lists.' },
  },
  // Old RM-first links.
  { path: 'rm', pathMatch: 'full', redirectTo: 'today' },
  { path: 'rm/today/ideas/:clientId', redirectTo: ({ params }) => `/ideas?client=${encodeURIComponent(params['clientId'])}` },
  {
    path: 'rm/:tab',
    redirectTo: ({ params, queryParams }) => inject(Router).createUrlTree(['/', params['tab']], { queryParams }),
  },
  { path: '**', redirectTo: 'today' },
];
