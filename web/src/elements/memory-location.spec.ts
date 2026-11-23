import { MemoryLocationStrategy } from './memory-location';

describe('MemoryLocationStrategy', () => {
  it('keeps routes in memory with back and forward', () => {
    const loc = new MemoryLocationStrategy();
    const pops: unknown[] = [];
    loc.onPopState((e) => pops.push(e.type));
    const before = window.location.href;
    loc.pushState(null, '', '/today', '');
    loc.pushState({ n: 1 }, '', '/chat', 'q=1');
    expect(loc.path()).toBe('/chat?q=1');
    expect(loc.getState()).toEqual({ n: 1 });
    loc.back();
    expect(loc.path()).toBe('/today');
    loc.forward();
    expect(loc.path()).toBe('/chat?q=1');
    loc.replaceState(null, '', '/library', '');
    expect(loc.path()).toBe('/library');
    expect(pops).toEqual(['popstate', 'popstate']);
    expect(window.location.href).toBe(before);
  });
});
