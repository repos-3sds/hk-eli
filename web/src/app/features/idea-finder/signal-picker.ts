import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { IDEA_SIGNALS, MAX_SIGNALS, SIGNAL_GROUPS, STARTER_PACKS } from '../../core/ideas/idea-warehouse.fixture';
import { IdeaFinderStore } from './idea-finder.store';

/**
 * The left column of Ideas: starter packs, then signals grouped by plain questions, up to 10 picked.
 * Each signal has a three-part hover card: what it checks, why it matters, what it does not tell you.
 */
@Component({
  selector: 'eli-signal-picker',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'complementary', 'aria-label': 'Signals' },
  templateUrl: './signal-picker.html',
  styleUrl: './signal-picker.scss',
})
export class SignalPicker {
  protected readonly store = inject(IdeaFinderStore);
  protected readonly groups = SIGNAL_GROUPS;
  protected readonly packs = STARTER_PACKS;
  protected readonly maxSignals = MAX_SIGNALS;

  protected signalsIn(group: string) {
    return IDEA_SIGNALS.filter((s) => s.group === group);
  }
}
