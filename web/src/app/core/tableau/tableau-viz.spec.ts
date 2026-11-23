import { MockVizDriver, safeMockUrl } from './tableau-viz';

describe('safeMockUrl', () => {
  it('only lets mock Tableau view pages into the frame', () => {
    expect(safeMockUrl('/tableau/proposed/views/ALL_position_scenario?shock_pct=-0.1')).toBe('/tableau/proposed/views/ALL_position_scenario?shock_pct=-0.1');
    expect(safeMockUrl('https://evil.example/tableau/x/views/a')).toBeNull();
    expect(safeMockUrl('javascript:alert(1)')).toBeNull();
    expect(safeMockUrl(undefined)).toBeNull();
  });
});

describe('MockVizDriver', () => {
  function setup() {
    const posted: { msg: Record<string, unknown>; origin: string }[] = [];
    const contentWindow = { postMessage: (msg: Record<string, unknown>, origin: string) => posted.push({ msg, origin }) };
    const frame = { contentWindow } as unknown as HTMLIFrameElement;
    const listeners: ((e: MessageEvent) => void)[] = [];
    const win = { addEventListener: (_: string, f: (e: MessageEvent) => void) => listeners.push(f), removeEventListener: () => undefined } as unknown as Window;
    let interactive = 0;
    const d = new MockVizDriver(frame, 'http://localhost:4210', { firstInteractive: () => interactive++ }, win);
    const reply = (data: unknown, origin = 'http://localhost:4210', source: unknown = contentWindow) =>
      listeners.forEach((f) => f({ data, origin, source } as MessageEvent));
    return { d, posted, reply, interactive: () => interactive };
  }

  it('posts the runtime call to the frame and resolves on its "done"', async () => {
    const { d, posted, reply } = setup();
    const p = d.changeParameterValueAsync('shock_pct', -0.2);
    expect(posted[0].msg).toMatchObject({ target: 'hkeli-viz', method: 'changeParameterValueAsync', name: 'shock_pct', value: -0.2 });
    expect(posted[0].origin).toBe('http://localhost:4210');
    reply({ source: 'hkeli-viz', event: 'done', id: posted[0].msg['id'] });
    await expect(p).resolves.toBeUndefined();
  });

  it('rejects on an error reply and ignores other origins', async () => {
    const { d, posted, reply, interactive } = setup();
    const p = d.applyFilterAsync('deal_status', ['LIVE']);
    const id = posted[0].msg['id'];
    reply({ source: 'hkeli-viz', event: 'done', id }, 'https://evil.example');
    reply({ source: 'hkeli-viz', event: 'firstinteractive' });
    reply({ source: 'hkeli-viz', event: 'error', id, message: 'Unknown field' });
    await expect(p).rejects.toThrow('Unknown field');
    expect(interactive()).toBe(1);
  });
});
