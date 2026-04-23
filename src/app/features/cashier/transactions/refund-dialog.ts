import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

export interface RefundDialogData {
  readonly reference: string;
  readonly itemCount: number;
  readonly totalLabel: string;
}

export interface RefundDialogResult {
  readonly reason: string | null;
}

@Component({
  selector: 'app-refund-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="refund__title">
      <mat-icon class="refund__icon">undo</mat-icon>
      Refund sale
    </h2>
    <mat-dialog-content>
      <p class="refund__summary">
        Refund <strong>{{ data.reference }}</strong>
        ({{ data.itemCount }} {{ data.itemCount === 1 ? 'item' : 'items' }},
        {{ data.totalLabel }})?
      </p>
      <p class="refund__note">
        Stock returns to inventory as a new batch and
        <strong>an admin will be notified</strong> in real time.
      </p>

      <mat-form-field appearance="outline" class="refund__reason">
        <mat-label>Reason (optional)</mat-label>
        <textarea
          matInput
          rows="3"
          maxlength="500"
          placeholder="e.g. Damaged item, wrong product, customer changed mind…"
          [ngModel]="reason()"
          (ngModelChange)="reason.set($event)"
        ></textarea>
        <mat-hint align="end">{{ reason().length }} / 500</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="warn" (click)="confirm()">Refund</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .refund__title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0;
      }
      .refund__icon { color: var(--mat-sys-error); }
      .refund__summary { margin: 0 0 0.5rem; line-height: 1.5; }
      .refund__note {
        margin: 0 0 1rem;
        padding: 0.65rem 0.85rem;
        border-radius: 0.5rem;
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
        font-size: 0.875rem;
        line-height: 1.45;
      }
      .refund__reason { width: 100%; }
    `,
  ],
})
export class RefundDialog {
  protected readonly data = inject<RefundDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<RefundDialog, RefundDialogResult>);

  protected readonly reason = signal<string>('');

  protected confirm(): void {
    const trimmed = this.reason().trim();
    this.ref.close({ reason: trimmed === '' ? null : trimmed });
  }
}
