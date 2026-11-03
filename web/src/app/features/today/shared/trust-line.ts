import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { EliDatePipe } from './format';
import { EvidenceDialog } from './evidence-dialog';

/** "Business date · sources · Figures computed, words by AI · View rows" (R20, R29). */
@Component({
  selector: 'eli-trust-line',
  imports: [MatIconModule, EliDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-icon svgIcon="info" aria-hidden="true" />
    <span>Business date {{ businessDate() | eliDate: 'long' }} · {{ sources().join(', ') }} · Figures computed, words by AI</span>
    <button type="button" class="eli-link" (click)="openRows()">View rows</button>
  `,
  styles: `
    :host { display: flex; align-items: center; gap: var(--eli-space-3); color: var(--eli-text-muted); font-size: var(--eli-font-size-s); line-height: var(--eli-line-height-s); }
    mat-icon { width: 14px; height: 14px; }
    .eli-link { font-size: inherit; }
  `,
})
export class TrustLine {
  private readonly dialog = inject(MatDialog);
  readonly businessDate = input.required<string>();
  readonly sources = input.required<readonly string[]>();
  readonly reference = input('brief');

  protected openRows(): void {
    this.dialog.open(EvidenceDialog, { data: { reference: this.reference(), title: 'Rows behind these figures' }, width: '720px', maxWidth: '95vw' });
  }
}
