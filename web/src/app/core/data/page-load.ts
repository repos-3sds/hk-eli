import { DOCUMENT, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map, switchMap, throwError, timer } from 'rxjs';
import { APP_CONFIG, AppConfig, MockScenario } from '../config/app-config';

export type PageState = 'loading' | 'error' | 'empty' | 'ready';

/** The mock scenario in force: `?scenario=` on the URL, else the config (the empty server sets "empty"). Gateway: always normal. */
export function currentScenario(config: AppConfig, document: Document): MockScenario {
  if (config.dataSource !== 'mock') return 'normal';
  const fromUrl = new URLSearchParams(document.location?.search ?? '').get('scenario');
  return (fromUrl as MockScenario | null) ?? config.mockScenario;
}

/**
 * The load state for a tab whose figures come from the overnight dataset (Shelf, Business Update, Alerts,
 * Feedback). On the mock it follows `?scenario=empty|error|slow`, so every state can be seen without a back end;
 * on the gateway the tab's own calls decide. Call from an injection context.
 */
export function pageLoad(failureText: string) {
  const config = inject(APP_CONFIG);
  const document = inject(DOCUMENT);
  const scenario = () => currentScenario(config, document);
  const res = rxResource({
    stream: () => {
      const s = scenario();
      const latency = s === 'slow' ? config.mockLatencyMs * 6 : config.mockLatencyMs / 2;
      return timer(latency).pipe(switchMap(() => (s === 'error' ? throwError(() => new Error(failureText)) : timer(0).pipe(map(() => s)))));
    },
  });
  const state = computed<PageState>(() => {
    if (res.error()) return 'error';
    if (res.isLoading() || !res.hasValue()) return 'loading';
    return res.value() === 'empty' ? 'empty' : 'ready';
  });
  return { state, failureText, reload: () => res.reload() };
}

export type PageLoad = ReturnType<typeof pageLoad>;
