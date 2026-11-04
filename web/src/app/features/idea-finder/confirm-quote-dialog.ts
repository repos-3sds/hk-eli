import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { Idea } from '../../core/models/today.models';

export interface ConfirmQuoteData {
  readonly clientName: string;
  /** Only the title and terms are shown. */
  readonly idea: Pick<Idea, 'title' | 'terms'>;
}

/** The RM's yes before anything leaves the chatbot: a live-quote request to the desk. */
@Component({
  selector: 'eli-confirm-quote-dialog',
  imports: [MatDialogModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Request a live quote?</h2>
    <mat-dialog-content>
      <p>This sends a quote request to the SPE desk for <strong>{{ data.clientName }}</strong>:</p>
      <p class="terms">{{ data.idea.title }} · KI {{ data.idea.terms.kiPct }}% · strike {{ data.idea.terms.strikePct }}% · indicative coupon {{ data.idea.terms.couponPct }}% p.a.</p>
      <p class="note">Nothing is sent to the client. The desk replies with a live price.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton="outlined" [mat-dialog-close]="false">Cancel</button>
      <button matButton="filled" [mat-dialog-close]="true" cdkFocusInitial>Send request</button>
    </mat-dialog-actions>
  `,
  styles: `
    .terms { padding: var(--eli-space-4) var(--eli-space-6); border-radius: var(--eli-radius-s); background: var(--eli-bg-canvas); color: var(--eli-text-strong); }
    .note { color: var(--eli-text-muted-2); font-size: var(--eli-font-size-s); }
    strong { font-weight: var(--eli-weight-semibold); }
  `,
})
export class ConfirmQuoteDialog {
  protected readonly data = inject<ConfirmQuoteData>(MAT_DIALOG_DATA);
}
