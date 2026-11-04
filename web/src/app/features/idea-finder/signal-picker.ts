import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { IDEA_SIGNALS, MAX_SIGNALS, SIGNAL_GROUPS, STARTER_PACKS } from '../../core/ideas/idea-warehouse.fixture';
import { IdeaFinderStore } from './idea-finder.store';
import { MyPack } from './my-packs.store';

/**
 * The left column of Ideas: the RM's own packs, the starter packs, then signals grouped by plain questions,
 * up to 10 picked. Any mix that is not already a pack can be saved as "my pack". Each signal has a
 * three-part hover card: what it checks, why it matters, what it does not tell you.
 */
@Component({
  selector: 'eli-signal-picker',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'complementary', 'aria-label': 'Signals' },
  templateUrl: './signal-picker.html',
  styleUrl: './signal-picker.scss',
})
export class SignalPicker {
  protected readonly store = inject(IdeaFinderStore);
  private readonly snack = inject(MatSnackBar);
  protected readonly groups = SIGNAL_GROUPS;
  protected readonly packs = STARTER_PACKS;
  protected readonly maxSignals = MAX_SIGNALS;
  protected readonly saving = signal(false);
  protected readonly draftName = signal('');

  protected signalsIn(group: string) {
    return IDEA_SIGNALS.filter((s) => s.group === group);
  }

  /** " · 6M · coupon ≥ 15% · no NVDA": the filters a saved pack carries, in a few words. */
  protected describe(p: MyPack): string {
    const f = p.filters;
    const parts = [
      f.tenorMonths ? `${f.tenorMonths}M` : '',
      f.minCouponPct !== null ? `coupon ≥ ${f.minCouponPct}%` : '',
      f.maxKiPct !== null ? `KI ≤ ${f.maxKiPct}%` : '',
      f.include.length ? `only ${f.include.join(', ')}` : '',
      f.exclude.length ? `no ${f.exclude.join(', ')}` : '',
    ].filter(Boolean);
    return parts.length ? ` · ${parts.join(' · ')}` : '';
  }

  protected startSave(): void {
    const client = this.store.client();
    const n = this.store.myPacks.packs().length + 1;
    this.draftName.set(client ? `${client.name.split(' ')[0]} ideas` : `My pack ${n}`);
    this.saving.set(true);
  }

  protected save(): void {
    const pack = this.store.saveMyPack(this.draftName());
    this.saving.set(false);
    this.snack.open(`Saved "${pack.name}" to My packs.`, 'OK', { duration: 3000 });
  }

  protected remove(id: string): void {
    const gone = this.store.myPacks.remove(id);
    if (gone) {
      this.snack.open(`Deleted "${gone.name}".`, 'Undo', { duration: 5000 }).onAction().subscribe(() => this.store.myPacks.restore(gone));
    }
  }
}
