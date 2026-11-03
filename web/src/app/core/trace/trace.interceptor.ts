import { HttpInterceptorFn } from '@angular/common/http';

/** W3C trace context: 16-byte trace id, 8-byte span id, both random hex. */
export function newTraceparent(random: (bytes: number) => Uint8Array = randomBytes): string {
  const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `00-${hex(random(16))}-${hex(random(8))}-01`;
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/**
 * Every request leaves the browser with one trace id (OpenTelemetry `traceparent`), which the
 * gateway, Stork AI and the services carry through to ELK. A request that already has one keeps it.
 */
export const traceInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.headers.has('traceparent')) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { traceparent: newTraceparent() } }));
};
