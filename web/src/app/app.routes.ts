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
    // Today is built from the same 12 HK_ELI Tableau views as the chat (discovery docs); every tile is a pipeline answer.
    path: 'today',
    title: 'Today · HK ELI Chatbot',
    loadComponent: () => import('./features/book/book-page').then((m) => m.BookPage),
  },
  {
    path: 'chat',
    title: 'Chat · HK ELI Chatbot',
    loadComponent: () => import('./features/chat/chat-page').then((m) => m.ChatPage),
  },
  {
    // Every question by category, unique to each persona (Hawk: its own tab below Today and Chat).
    path: 'library',
    title: 'Prompt library · HK ELI Chatbot',
    loadComponent: () => import('./features/library/library-page').then((m) => m.PromptLibraryPage),
  },
  // Beyond the discovery docs, so hidden (Hawk, 2026-11-20). Old links land on Today.
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
