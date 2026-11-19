import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { HelpSheet, HelpTab } from './help-sheet';

/** Opens Help as a side sheet on the tab asked for: getting started, what Chat can answer, or the glossary. */
@Injectable({ providedIn: 'root' })
export class HelpOpener {
  private readonly dialog = inject(MatDialog);

  open(tab: HelpTab = 'start'): void {
    this.dialog.getDialogById('help')?.close();
    this.dialog.open(HelpSheet, {
      id: 'help', data: { tab }, position: { right: '0', top: '0' }, height: '100vh', width: '520px', maxWidth: '100vw',
      panelClass: 'eli-side-sheet', autoFocus: 'dialog', ariaLabel: 'Help',
    });
  }
}
