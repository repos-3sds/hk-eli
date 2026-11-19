import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';
import { SessionService } from './session.service';

/**
 * Demo only: tells the agent's API who is asking (X-Eli-User / X-Eli-Role), so history, feedback and the model-call audit record the user and role.
 * Behind the bank's API gateway the SSO token carries this instead and the gateway ignores these headers.
 * Only calls to the HK ELI gateway get them.
 */
export const callerInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(APP_CONFIG);
  if (!req.url.startsWith(config.gatewayBaseUrl)) {
    return next(req);
  }
  const user = inject(SessionService).user();
  return next(req.clone({ setHeaders: { 'X-Eli-User': user.displayName, 'X-Eli-Role': user.role } }));
};
