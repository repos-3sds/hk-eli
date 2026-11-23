import { Injectable, OnDestroy } from '@angular/core';
import { LocationChangeListener, LocationStrategy } from '@angular/common';

/**
 * Keeps the widget's tab route in memory. Embedded in Digimarkets, the widget must not read or write the
 * host page's address bar or history, so Back and Forward stay the host's. The standalone app keeps
 * normal URLs (PathLocationStrategy).
 */
@Injectable()
export class MemoryLocationStrategy extends LocationStrategy implements OnDestroy {
  private readonly stack: string[] = ['/'];
  private readonly states: unknown[] = [null];
  private index = 0;
  private readonly listeners = new Set<LocationChangeListener>();

  path(): string {
    return this.stack[this.index];
  }

  prepareExternalUrl(internal: string): string {
    return internal;
  }

  getState(): unknown {
    return this.states[this.index];
  }

  getBaseHref(): string {
    return '/';
  }

  pushState(state: unknown, _title: string, path: string, query: string): void {
    this.stack.splice(this.index + 1);
    this.states.splice(this.index + 1);
    this.stack.push(join(path, query));
    this.states.push(state);
    this.index = this.stack.length - 1;
  }

  replaceState(state: unknown, _title: string, path: string, query: string): void {
    this.stack[this.index] = join(path, query);
    this.states[this.index] = state;
  }

  forward(): void {
    this.go(1);
  }

  back(): void {
    this.go(-1);
  }

  override historyGo(relativePosition = 0): void {
    this.go(relativePosition);
  }

  onPopState(fn: LocationChangeListener): void {
    this.listeners.add(fn);
  }

  ngOnDestroy(): void {
    this.listeners.clear();
  }

  private go(delta: number): void {
    const next = Math.min(Math.max(this.index + delta, 0), this.stack.length - 1);
    if (next === this.index) return;
    this.index = next;
    for (const fn of this.listeners) fn({ type: 'popstate', state: this.states[this.index] });
  }
}

function join(path: string, query: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return query ? `${p}?${query.replace(/^\?/, '')}` : p;
}
