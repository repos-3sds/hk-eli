import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { VizFilterCard } from './tableau-viz';
import { VizFilterChange, VizFilters, flagDays, summary } from './viz-filters';

const SEG: VizFilterCard = { field: 'bp_div_type', caption: 'Bp Div Type', values: ['PB', 'Treasures(HK)', 'Treasures(TPC)'], applied: ['Treasures(HK)'] };
const BRANCH: VizFilterCard = { field: 'cust_branch', caption: 'Cust Branch', values: 'ABCDEFGHIJ'.split(''), applied: null };
const flag = (d: number, on = false): VizFilterCard => ({ field: `in_n${d}`, caption: `in_n${d}`, values: ['FALSE', 'TRUE'], applied: on ? ['TRUE'] : null });

function make(cards: VizFilterCard[], changed = false) {
  TestBed.configureTestingModule({ imports: [VizFilters], providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(VizFilters);
  f.componentRef.setInput('cards', cards);
  f.componentRef.setInput('changed', changed);
  const emitted: VizFilterChange[][] = [];
  f.componentInstance.change.subscribe((c) => emitted.push(c));
  return { f, el: f.nativeElement as HTMLElement, emitted };
}

describe('VizFilters', () => {
  it('summarises a card as Tableau does', () => {
    expect(summary(SEG)).toBe('Treasures(HK)');
    expect(summary(BRANCH)).toBe('All');
    expect(summary({ ...SEG, applied: ['PB', 'Treasures(HK)'] })).toBe('2 of 3');
    expect(summary({ ...SEG, applied: [] })).toBe('None');
    // filtered to the only value it has: say the value, not "All"
    expect(summary({ field: 'deal_status', caption: 'Deal Status', values: ['LIVE'], applied: ['LIVE'] })).toBe('LIVE');
    expect(flagDays(flag(30))).toBe(30);
    expect(flagDays(SEG)).toBeNull();
  });

  it('opens a card, ticks values and (All), and searches long lists', async () => {
    const { f, el, emitted } = make([SEG, BRANCH]);
    await f.whenStable();
    const cards = el.querySelectorAll<HTMLButtonElement>('button.card');
    expect([...cards].map((b) => [...b.querySelectorAll('.cap, .val')].map((s) => s.textContent).join(': '))).toEqual(['Bp Div Type: Treasures(HK)', 'Cust Branch: All']);
    cards[0].click();
    await f.whenStable();
    const boxes = el.querySelectorAll<HTMLInputElement>('.menu input[type=checkbox]');
    expect(boxes.length).toBe(4); // (All) + 3 values
    expect(el.querySelector('.menu .find')).toBeNull(); // short list: no search box
    boxes[1].click(); // tick PB
    expect(emitted.at(-1)).toEqual([{ field: 'bp_div_type', values: ['PB', 'Treasures(HK)'] }]);
    boxes[0].click(); // (All)
    expect(emitted.at(-1)).toEqual([{ field: 'bp_div_type', values: null }]);

    cards[1].click();
    await f.whenStable();
    const find = el.querySelector<HTMLInputElement>('.menu .find')!;
    find.value = 'c';
    find.dispatchEvent(new Event('input'));
    await f.whenStable();
    expect([...el.querySelectorAll('.opts .opt')].map((o) => o.textContent?.trim())).toEqual(['C']);
    el.querySelector<HTMLInputElement>('.opts input')!.click(); // untick C from all
    expect(emitted.at(-1)![0].values).toEqual('ABDEFGHIJ'.split(''));
  });

  it('reads the maturity flags as one "Matures within" choice', async () => {
    const { f, el, emitted } = make([flag(7), flag(30, true), flag(90)]);
    await f.whenStable();
    expect(el.querySelectorAll('button.card').length).toBe(0);
    const sel = el.querySelector<HTMLSelectElement>('select')!;
    expect(sel.value).toBe('30');
    sel.value = '7';
    sel.dispatchEvent(new Event('change'));
    expect(emitted.at(-1)).toEqual([
      { field: 'in_n7', values: ['TRUE'] }, { field: 'in_n30', values: null }, { field: 'in_n90', values: null },
    ]);
  });

  it('offers Reset only when a filter moved away from the answer\'s own', async () => {
    const a = make([SEG]);
    await a.f.whenStable();
    expect(a.el.querySelector('.reset')).toBeNull();
    TestBed.resetTestingModule();
    const b = make([SEG], true);
    await b.f.whenStable();
    let reset = 0;
    b.f.componentInstance.reset.subscribe(() => reset++);
    b.el.querySelector<HTMLButtonElement>('.reset')!.click();
    expect(reset).toBe(1);
  });
});
