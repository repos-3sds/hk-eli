import { Injectable, signal } from '@angular/core';
import { IdeaFilters } from '../../core/ideas/idea-finder.models';

/** A pack the RM saved: their own signal mix plus hard filters. The client is not saved, so a pack works for anyone. */
export interface MyPack {
  readonly id: string;
  readonly name: string;
  readonly signalIds: readonly string[];
  readonly filters: Omit<IdeaFilters, 'clientId'>;
  readonly savedAt: string;
}

const KEY = 'hk-eli.my-packs.v1';

/**
 * The RM's saved packs. Kept in this browser for now; when the gateway is wired they move to the RM's
 * profile so they follow the RM to any desk. Storage can be blocked, so every read and write is guarded.
 */
@Injectable({ providedIn: 'root' })
export class MyPacksStore {
  readonly packs = signal<readonly MyPack[]>(load());

  save(name: string, signalIds: readonly string[], filters: IdeaFilters): MyPack {
    const { clientId: _client, ...rest } = filters;
    const pack: MyPack = { id: `my-${Date.now().toString(36)}`, name: name.trim(), signalIds: [...signalIds], filters: rest, savedAt: new Date().toISOString() };
    this.packs.update((list) => [pack, ...list.filter((p) => p.name.toLowerCase() !== pack.name.toLowerCase())]);
    persist(this.packs());
    return pack;
  }

  remove(id: string): MyPack | null {
    const gone = this.packs().find((p) => p.id === id) ?? null;
    this.packs.update((list) => list.filter((p) => p.id !== id));
    persist(this.packs());
    return gone;
  }

  restore(pack: MyPack): void {
    this.packs.update((list) => [pack, ...list.filter((p) => p.id !== pack.id)]);
    persist(this.packs());
  }
}

function load(): readonly MyPack[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as MyPack[]).filter((p) => p && typeof p.name === 'string' && Array.isArray(p.signalIds)) : [];
  } catch {
    return [];
  }
}

function persist(packs: readonly MyPack[]): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(packs));
  } catch {
    // Storage blocked: the packs still work for this visit.
  }
}
