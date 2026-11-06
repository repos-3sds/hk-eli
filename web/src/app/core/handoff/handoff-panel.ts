import { FeedbackButtons } from '../feedback/feedback-buttons';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { HandoffStore } from './handoff.store';
import { HandoffStatus, LINK_WINDOW_BUSINESS_DAYS } from './handoff.models';
import { longDate } from '../time/business-calendar';

/**
 * The hand-off list, as a side sheet: the draft grouped by owner RM with Copy for Teams and Download CSV,
 * then "Mark as handed off" to start the record. The Sent tab shows each record and linked conversion.
 */
@Component({
  selector: 'eli-handoff-panel',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule, FormsModule, DatePipe, FeedbackButtons],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './handoff-panel.html',
  styleUrl: './handoff-panel.scss',
})
export class HandoffPanel {
  protected readonly store = inject(HandoffStore);
  private readonly snack = inject(MatSnackBar);
  protected readonly window = LINK_WINDOW_BUSINESS_DAYS;
  /** The item a desk decline is being recorded for, and the reason typed. */
  protected readonly declining = signal<{ recordId: string; itemId: string } | null>(null);
  protected readonly declineWhy = signal('');

  protected copyForTeams(): void {
    const text = this.store.teamsText();
    const failed = () => this.snack.open('Could not copy. Download the CSV instead.', 'OK', { duration: 5000 });
    if (!navigator.clipboard) {
      failed();
      return;
    }
    navigator.clipboard.writeText(text).then(() => this.snack.open('Copied for Teams, grouped by RM, with the internal-only label.', 'OK', { duration: 4000 }), failed);
  }

  protected downloadCsv(): void {
    const blob = new Blob([this.store.csv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eli-handoff-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected markSent(): void {
    const record = this.store.markSent();
    if (record) {
      this.snack.open(`Recorded. Trades by these clients in related underlyings until ${longDate(record.windowEnds)} will be linked.`, 'OK', { duration: 5000 });
    }
  }

  protected startDecline(recordId: string, itemId: string): void {
    this.declining.set({ recordId, itemId });
    this.declineWhy.set('');
  }

  protected saveDecline(): void {
    const d = this.declining();
    if (d) {
      this.store.recordDeskDecline(d.recordId, d.itemId, this.declineWhy());
      this.declining.set(null);
    }
  }

  protected statusIcon(s: HandoffStatus): string {
    return { sent: 'clock', 'linked-trade': 'circle-check', 'window-closed': 'moon', 'desk-declined': 'x' }[s];
  }
}
