import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RFQ_LABELS } from '../../../core/models/today.models';
import { ConcentrationBar } from '../shared/concentration-bar';
import { EliDatePipe, UsdPipe } from '../shared/format';
import { OutcomeChip } from '../shared/outcome-chip';
import { TodayStore } from '../today.store';

/** The client in focus: book, concentration, lead outcomes from the blotter, recent RFQs. All read from records. */
@Component({
  selector: 'eli-context-dock',
  imports: [MatIconModule, ConcentrationBar, OutcomeChip, EliDatePipe, UsdPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './context-dock.html',
  styleUrl: './context-dock.scss',
})
export class ContextDock {
  protected readonly store = inject(TodayStore);
  private readonly snack = inject(MatSnackBar);
  protected readonly rfqLabels = RFQ_LABELS;

  protected sendToLinked(shortName: string, widgets: readonly string[]): void {
    this.snack.open(`${shortName} sent to ${widgets.join(' and ')}.`, 'OK', { duration: 3000 });
  }
}
