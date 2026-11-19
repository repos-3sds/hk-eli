import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ScheduleSheet, ScheduleSheetData } from './schedule-sheet';

/** Opens the schedule form as a side sheet, prefilled from where it was opened. */
@Injectable({ providedIn: 'root' })
export class ScheduleOpener {
  private readonly dialog = inject(MatDialog);

  open(data: ScheduleSheetData = {}): void {
    if (this.dialog.getDialogById('schedule')) {
      return;
    }
    this.dialog.open(ScheduleSheet, {
      id: 'schedule', data, position: { right: '0', top: '0' }, height: '100vh', width: '640px', maxWidth: '100vw',
      panelClass: 'eli-side-sheet', autoFocus: 'dialog', ariaLabel: 'Schedule a report',
    });
  }
}
