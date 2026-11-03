import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RFQ_LABELS } from '../../../core/models/today.models';
import { BriefActionsBlock } from './brief-actions-block';
import { ConcentrationBar } from '../shared/concentration-bar';
import { EliDatePipe, UsdPipe } from '../shared/format';
import { OutcomeChip } from '../shared/outcome-chip';
import { TodayStore } from '../today.store';

/** The client in focus: their morning-brief actions (when they are in the brief), then book, concentration, lead outcomes from the blotter, recent RFQs. All read from records. */
@Component({
  selector: 'eli-context-dock',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, BriefActionsBlock, ConcentrationBar, OutcomeChip, EliDatePipe, UsdPipe],
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
