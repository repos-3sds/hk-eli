import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { START_VIEWS, SessionService } from './core/session/session.service';

/**
 * The widget's tabs. Launch users are GFM WMS, CBG PM and CBG TSM, so routes no longer carry an "rm" prefix.
 * Old /rm/... links (walkthroughs, bookmarks) redirect to the same tab, keeping their query.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: ({ queryParams }) => inject(Router).createUrlTree(['/', START_VIEWS[inject(SessionService).role()]], { queryParams }),
  },
  {
    path: 'today',
    title: 'Today · HK ELI Chatbot',
    loadComponent: () => import('./features/today/today-layout').then((m) => m.TodayLayout),
    children: [
      { path: '', loadComponent: () => import('./features/today/brief/brief-page').then((m) => m.BriefPage) },
      // Ideas is hidden (beyond the discovery docs), so older links to a client's ideas stay on Today.
      { path: 'ideas/:clientId', redirectTo: '' },
    ],
  },
  {
    path: 'chat',
    title: 'Chat · HK ELI Chatbot',
    loadComponent: () => import('./features/chat/chat-page').then((m) => m.ChatPage),
  },
  // Beyond the discovery docs, so hidden (Hawk, 2026-11-20); their code stays. Old links land on Today.
  ...['ideas', 'shelf', 'update', 'alerts', 'feedback'].map((path) => ({ path, redirectTo: 'today' })),
  // Old RM-first links.
  { path: 'rm', pathMatch: 'full', redirectTo: 'today' },
  { path: 'rm/today/ideas/:clientId', redirectTo: 'today' },
  {
    path: 'rm/:tab',
    redirectTo: ({ params, queryParams }) => inject(Router).createUrlTree(['/', params['tab']], { queryParams }),
  },
  { path: '**', redirectTo: 'today' },
];
