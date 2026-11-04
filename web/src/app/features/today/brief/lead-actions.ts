import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HandoffStore } from '../../../core/handoff/handoff.store';
import { HandoffOpener } from '../../../core/handoff/handoff-opener';
import { Lead, MOMENT_LABELS } from '../../../core/models/today.models';
import { TodayStore } from '../today.store';

/** What a launch user can do with a brief lead. Shared by the brief rows and the right-hand panel, so both behave the same. */
@Injectable()
export class LeadActions {
  private readonly store = inject(TodayStore);
  private readonly snack = inject(MatSnackBar);
  private readonly handoff = inject(HandoffStore);
  private readonly opener = inject(HandoffOpener);

  ask(lead: Lead): void {
    this.store.pickClient(lead.clientId);
    this.store.askAbout(lead.clientName);
  }

  isHandedOff(lead: Lead): boolean {
    return this.handoff.has(lead.clientId);
  }

  /** Puts the client on the hand-off list for the owner RM, with the moment as the reason. */
  addToHandoff(lead: Lead): void {
    const pocket = this.store.pocketFilter();
    const added = this.handoff.add({
      clientId: lead.clientId,
      clientName: lead.clientName,
      ownerRm: lead.ownerRm,
      branch: lead.branch,
      reason: pocket ? `${MOMENT_LABELS[lead.moment.type]}; ${pocket.branch} ${pocket.segment} pocket at ${pocket.rolloverPct}% rollover` : MOMENT_LABELS[lead.moment.type],
      idea: null,
      underlyings: [],
      from: 'Today',
    });
    this.snack
      .open(added ? `${lead.clientName} added to the hand-off list for ${lead.ownerRm.replace(/\.$/, '')}.` : `${lead.clientName} is already on the hand-off list.`, 'Open list', { duration: 4000 })
      .onAction()
      .subscribe(() => this.opener.open());
  }

  /** "Mark reviewed", with undo. If the lead was in the panel, the panel moves on to the next lead. */
  park(lead: Lead): void {
    const wasFocused = this.store.focusedLead()?.id === lead.id;
    const open = this.store.openLeads();
    const next = open[open.indexOf(lead) + 1] ?? open.find((l) => l.id !== lead.id) ?? null;
    this.store.parkLead(lead);
    if (wasFocused && next) {
      this.store.pickClient(next.clientId);
    }
    this.snack
      .open(`${lead.clientName} marked reviewed for today. It stays in the outcome window.`, 'Undo', { duration: 6000 })
      .onAction()
      .subscribe(() => {
        this.store.unparkLead(lead);
        this.store.pickClient(lead.clientId);
      });
  }
}
