import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { HandoffPanel } from './handoff-panel';
import { HandoffStore } from './handoff.store';

/** Opens the hand-off list as a side sheet on the right of the widget. */
@Injectable({ providedIn: 'root' })
export class HandoffOpener {
  private readonly dialog = inject(MatDialog);
  private readonly store = inject(HandoffStore);

  open(tab: 'draft' | 'sent' = 'draft'): void {
    this.store.tab.set(tab);
    if (this.dialog.getDialogById('handoff')) {
      return;
    }
    this.dialog.open(HandoffPanel, {
      id: 'handoff',
      position: { right: '0', top: '0' },
      height: '100vh',
      width: '600px',
      maxWidth: '100vw',
      panelClass: 'eli-side-sheet',
      autoFocus: 'dialog',
      ariaLabel: 'Hand-off list',
    });
  }
}
