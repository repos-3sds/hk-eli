import { callerInterceptor } from './core/session/caller.interceptor';
import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { APP_CONFIG, AppConfig } from './core/config/app-config';
import { provideChatData } from './core/chat/provide-chat-data';
import { provideIdeaFinderData } from './core/ideas/provide-idea-finder-data';
import { provideTodayData } from './core/data/provide-today-data';
import { provideIcons } from './core/icons/icons';
import { traceInterceptor } from './core/trace/trace.interceptor';
import { routes } from './app.routes';

export function createAppConfig(config: AppConfig): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      provideZonelessChangeDetection(),
      provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
      provideHttpClient(withFetch(), withInterceptors([traceInterceptor, callerInterceptor])),
      { provide: APP_CONFIG, useValue: config },
      provideTodayData(),
      provideChatData(),
      provideIdeaFinderData(),
      provideIcons(),
    ],
  };
}
