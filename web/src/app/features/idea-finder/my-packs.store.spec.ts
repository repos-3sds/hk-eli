import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { IdeaFinderDataSource } from '../../core/ideas/idea-finder-data-source';
import { NO_FILTERS } from '../../core/ideas/idea-finder.models';
import { IdeaFinderStore } from './idea-finder.store';
import { MyPacksStore } from './my-packs.store';

describe('My packs', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // Storage not available in this runner: the store still works in memory.
    }
    TestBed.configureTestingModule({
      providers: [IdeaFinderStore, { provide: IdeaFinderDataSource, useValue: { search: () => of(null), read: () => of(null) } }],
    });
  });

  it('saves the signals and filters but not the client, and brings them back later', () => {
    const store = TestBed.inject(IdeaFinderStore);
    store.setClient('c-4821');
    store.patchFilters({ tenorMonths: 6, minCouponPct: 15 });
    store.addTicker('exclude', 'NVDA');
    store.toggleSignal('deep-ki');
    expect(store.canSavePack()).toBe(true);

    const pack = store.saveMyPack('Chan rollover');
    const { clientId: _c, ...noClient } = NO_FILTERS;
    expect(pack.filters).toEqual({ ...noClient, tenorMonths: 6, minCouponPct: 15, exclude: ['NVDA'] });
    expect('clientId' in pack.filters).toBe(false);
    expect(store.activeMyPackId()).toBe(pack.id);
    expect(store.canSavePack()).toBe(false);

    store.clearFilters();
    store.choosePack('defensive');
    store.chooseMyPack(pack);
    expect(store.filters().tenorMonths).toBe(6);
    expect(store.filters().clientId).toBe('c-4821');
    expect(store.picked()).toEqual(pack.signalIds);
  });

  it('deletes a pack and can undo the delete', () => {
    const packs = TestBed.inject(MyPacksStore);
    const pack = packs.save('Mine', ['top-coupon'], NO_FILTERS);
    const gone = packs.remove(pack.id)!;
    expect(packs.packs()).toHaveLength(0);
    packs.restore(gone);
    expect(packs.packs()[0].name).toBe('Mine');
  });

  it('keeps a stock in only one list', () => {
    const store = TestBed.inject(IdeaFinderStore);
    store.addTicker('include', 'AMD');
    store.addTicker('exclude', 'AMD');
    expect(store.filters().include).toEqual([]);
    expect(store.filters().exclude).toEqual(['AMD']);
  });
});
