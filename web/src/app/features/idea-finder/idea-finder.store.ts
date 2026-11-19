import { Injectable, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ROLLOVER_POCKETS, RolloverPocket } from '../../core/data/business.fixture';
import { FIXTURE_CLIENTS } from '../../core/data/today.fixture';
import { IdeaFinderDataSource } from '../../core/ideas/idea-finder-data-source';
import { FilterBlocker, IdeaFilters, NO_FILTERS, ReadIntent } from '../../core/ideas/idea-finder.models';
import { IDEA_SIGNALS, MAX_SIGNALS, STARTER_PACKS } from '../../core/ideas/idea-warehouse.fixture';
import { MyPack, MyPacksStore } from './my-packs.store';

/** State for the Ideas tab: plain words, hard filters, picked signals and the ranked results. */
@Injectable()
export class IdeaFinderStore {
  private readonly data = inject(IdeaFinderDataSource);
  readonly myPacks = inject(MyPacksStore);

  readonly text = signal('');
  readonly reading = signal(false);
  readonly readError = signal<string | null>(null);
  readonly lastRead = signal<ReadIntent | null>(null);
  readonly filters = signal<IdeaFilters>(NO_FILTERS);
  readonly picked = signal<readonly string[]>(STARTER_PACKS.find((p) => p.id === 'yield')!.signalIds);
  readonly showAll = signal(false);
  readonly openRow = signal<string | null>(null);
  readonly showHidden = signal(false);
  /** A rollover pocket the user came from on Today, shown as context above the results. */
  readonly pocket = signal<RolloverPocket | null>(null);

  readonly results = rxResource({
    params: () => ({ filters: this.filters(), signalIds: this.picked() }),
    stream: ({ params }) => this.data.search(params),
  });

  readonly client = computed(() => FIXTURE_CLIENTS.find((c) => c.id === this.filters().clientId) ?? null);
  readonly activePackId = computed(() => {
    const picked = new Set(this.picked());
    return STARTER_PACKS.find((p) => p.signalIds.length === picked.size && p.signalIds.every((id) => picked.has(id)))?.id ?? null;
  });
  /** The saved pack whose signals and filters match what is on screen, if any. */
  readonly activeMyPackId = computed(() => {
    const picked = new Set(this.picked());
    const { clientId: _c, ...f } = this.filters();
    return (
      this.myPacks.packs().find(
        (p) => p.signalIds.length === picked.size && p.signalIds.every((id) => picked.has(id)) && JSON.stringify(sortedFilters(p.filters)) === JSON.stringify(sortedFilters(f)),
      )?.id ?? null
    );
  });
  /** Offer "Save as my pack" only when what is on screen is not already a pack. */
  readonly canSavePack = computed(() => this.picked().length > 0 && !this.activePackId() && !this.activeMyPackId());
  readonly atMax = computed(() => this.picked().length >= MAX_SIGNALS);
  readonly topMatches = computed(() => (this.results.hasValue() ? this.results.value().matches.slice(0, this.showAll() ? undefined : 5) : []));
  readonly hiddenByLimits = computed(() => (this.results.hasValue() ? this.results.value().hiddenByLimits : []));
  readonly hiddenCount = computed(() => (this.results.hasValue() ? Math.max(0, this.results.value().matches.length - 5) : 0));
  readonly clientSignalsWithoutClient = computed(
    () => !this.client() && this.picked().some((id) => IDEA_SIGNALS.find((s) => s.id === id)?.needsClient),
  );

  /** Sends the plain words to be read, then applies the filters and any starter pack it implies. */
  read(): void {
    const text = this.text().trim();
    if (!text) {
      return;
    }
    this.reading.set(true);
    this.readError.set(null);
    this.data.read(text).subscribe({
      next: (intent) => {
        this.reading.set(false);
        this.lastRead.set(intent);
        this.filters.set({ ...intent.filters, clientId: intent.filters.clientId ?? this.filters().clientId });
        if (intent.packId) {
          this.choosePack(intent.packId);
        }
        this.showAll.set(false);
      },
      error: () => {
        this.reading.set(false);
        this.readError.set('Could not read that just now. Your filters are unchanged.');
      },
    });
  }

  choosePack(packId: string): void {
    const pack = STARTER_PACKS.find((p) => p.id === packId);
    if (pack) {
      this.picked.set(pack.signalIds);
    }
  }

  /** Applies a saved pack: its signals and its filters. The client picked stays as it is. */
  chooseMyPack(pack: MyPack): void {
    this.picked.set(pack.signalIds);
    this.filters.set({ ...pack.filters, clientId: this.filters().clientId });
    this.showAll.set(false);
  }

  saveMyPack(name: string): MyPack {
    return this.myPacks.save(name, this.picked(), this.filters());
  }

  toggleSignal(id: string): void {
    this.picked.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= MAX_SIGNALS ? list : [...list, id]));
  }

  setPocket(pocketId: string | null): void {
    this.pocket.set(ROLLOVER_POCKETS.find((p) => p.id === pocketId) ?? null);
  }

  setClient(clientId: string | null): void {
    this.filters.update((f) => ({ ...f, clientId }));
  }

  patchFilters(change: Partial<IdeaFilters>): void {
    this.filters.update((f) => ({ ...f, ...change }));
  }

  /** Adds a stock as "only these" or "leave out"; a stock is never in both lists. */
  addTicker(kind: 'include' | 'exclude', ticker: string): void {
    const other = kind === 'include' ? 'exclude' : 'include';
    this.filters.update((f) => ({ ...f, [kind]: f[kind].includes(ticker) ? f[kind] : [...f[kind], ticker], [other]: f[other].filter((t) => t !== ticker) }));
  }

  removeTicker(kind: 'include' | 'exclude', ticker: string): void {
    this.filters.update((f) => ({ ...f, [kind]: f[kind].filter((t) => t !== ticker) }));
  }

  /** Removes one hard filter, for example the one an empty result names. */
  dropFilter(key: FilterBlocker['key']): void {
    this.patchFilters(key === 'include' || key === 'exclude' ? { [key]: [] } : { [key]: null });
  }

  clearFilters(): void {
    this.filters.set({ ...NO_FILTERS, clientId: this.filters().clientId });
    this.lastRead.set(null);
  }
}

function sortedFilters(f: Omit<IdeaFilters, 'clientId'>) {
  return { ...f, include: [...f.include].sort(), exclude: [...f.exclude].sort() };
}
