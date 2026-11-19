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
    path: 'shelf',
    title: 'Shelf · HK ELI Chatbot',
    loadComponent: () => import('./features/shelf/shelf-page').then((m) => m.ShelfPage),
  },
  {
    path: 'update',
    title: 'Update · HK ELI Chatbot',
    loadComponent: () => import('./features/update/business-update-page').then((m) => m.BusinessUpdatePage),
  },
  {
    path: 'alerts',
    title: 'Alerts · HK ELI Chatbot',
    loadComponent: () => import('./features/alerts/alerts-page').then((m) => m.AlertsPage),
  },
  {
    path: 'feedback',
    title: 'Feedback this week · HK ELI Chatbot',
    loadComponent: () => import('./features/feedback/feedback-page').then((m) => m.FeedbackPage),
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
