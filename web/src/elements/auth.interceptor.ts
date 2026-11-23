import { HttpInterceptorFn } from '@angular/common/http';
import { InjectionToken, inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { APP_CONFIG } from '../app/core/config/app-config';

/** Returns the signed-in user's bearer token, or null. Set by the Digimarkets host on the element. */
export type AccessTokenProvider = () => string | null | Promise<string | null>;

export const ACCESS_TOKEN_PROVIDER = new InjectionToken<() => AccessTokenProvider | null>('ACCESS_TOKEN_PROVIDER');

/**
 * Embedded only: when the host page gives the element a token provider (`el.accessTokenProvider = () => ...`),
 * calls to the agent's API carry `Authorization: Bearer <token>`. The bank's edge checks it (SSO). Without a
 * provider nothing is added, which is the laptop and UAT demo case.
 */
export const accessTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(APP_CONFIG);
  const provider = inject(ACCESS_TOKEN_PROVIDER)();
  if (!provider || !req.url.startsWith(config.gatewayBaseUrl)) {
    return next(req);
  }
  return from(Promise.resolve(provider())).pipe(
    switchMap((token) => next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req)),
  );
};
