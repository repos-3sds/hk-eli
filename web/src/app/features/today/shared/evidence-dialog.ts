import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { TodayDataSource } from '../../../core/data/today-data-source';

export interface EvidenceDialogData {
  readonly reference: string;
  readonly title: string;
}

/** "View rows": the records behind the figures on screen. */
@Component({
  selector: 'eli-evidence-dialog',
  imports: [MatDialogModule, MatTableModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="intro">Figures are computed from these rows. The model only words them.</p>
      @if (rows.isLoading()) {
        <div class="eli-skeleton" style="height: 120px"></div>
      } @else if (rows.error()) {
        <p role="alert">The rows could not be loaded. Try again in a moment.</p>
      } @else if (rows.hasValue()) {
        <table mat-table [dataSource]="rows.value()">
          <ng-container matColumnDef="source"><th mat-header-cell *matHeaderCellDef>Source</th><td mat-cell *matCellDef="let r">{{ r.source }}</td></ng-container>
          <ng-container matColumnDef="field"><th mat-header-cell *matHeaderCellDef>Figure</th><td mat-cell *matCellDef="let r">{{ r.field }}</td></ng-container>
          <ng-container matColumnDef="value"><th mat-header-cell *matHeaderCellDef>Value</th><td mat-cell *matCellDef="let r" class="num">{{ r.value }}</td></ng-container>
          <ng-container matColumnDef="asOf"><th mat-header-cell *matHeaderCellDef>As of</th><td mat-cell *matCellDef="let r">{{ r.asOf }}</td></ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button matButton="outlined" mat-dialog-close>Close</button></mat-dialog-actions>
  `,
  styles: `
    .intro { margin: 0 0 var(--eli-space-6); color: var(--eli-text-muted-2); font-size: var(--eli-font-size-s); }
    table { width: 100%; }
    .num { text-align: right; }
  `,
})
export class EvidenceDialog {
  protected readonly data = inject<EvidenceDialogData>(MAT_DIALOG_DATA);
  private readonly source = inject(TodayDataSource);
  protected readonly columns = ['source', 'field', 'value', 'asOf'];
  protected readonly rows = rxResource({ stream: () => this.source.getEvidenceRows(this.data.reference) });
}
