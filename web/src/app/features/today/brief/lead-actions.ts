import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Lead } from '../../../core/models/today.models';
import { TodayStore } from '../today.store';

/** What the RM can do with a brief lead. Shared by the brief rows and the right-hand panel, so both behave the same. */
@Injectable()
export class LeadActions {
  private readonly store = inject(TodayStore);
  private readonly snack = inject(MatSnackBar);

  ask(lead: Lead): void {
    this.store.pickClient(lead.clientId);
    this.store.askAbout(lead.clientName);
  }

  /** "Not today", with undo. If the lead was in the panel, the panel moves on to the next lead. */
  park(lead: Lead): void {
    const wasFocused = this.store.focusedLead()?.id === lead.id;
    const open = this.store.openLeads();
    const next = open[open.indexOf(lead) + 1] ?? open.find((l) => l.id !== lead.id) ?? null;
    this.store.parkLead(lead);
    if (wasFocused && next) {
      this.store.pickClient(next.clientId);
    }
    this.snack
      .open(`${lead.clientName} parked for today. It stays in the outcome window.`, 'Undo', { duration: 6000 })
      .onAction()
      .subscribe(() => {
        this.store.unparkLead(lead);
        this.store.pickClient(lead.clientId);
      });
  }
}
