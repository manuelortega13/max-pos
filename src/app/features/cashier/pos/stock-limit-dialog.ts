import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export type StockLimitReason = 'out-of-stock' | 'at-limit' | 'partial';

export interface StockLimitDialogData {
  readonly reason: StockLimitReason;
  readonly productName: string;
  readonly stock: number;
  /** Only for 'partial' — how many units the cashier asked for. */
  readonly requested?: number;
  /** Only for 'partial' — how many were actually added to the cart. */
  readonly added?: number;
}

@Component({
  selector: 'app-stock-limit-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="stock__title">
      <mat-icon class="stock__icon" [class.stock__icon--error]="data.reason === 'out-of-stock'">
        {{ data.reason === 'out-of-stock' ? 'block' : 'warning_amber' }}
      </mat-icon>
      {{ title() }}
    </h2>
    <mat-dialog-content>
      @switch (data.reason) {
        @case ('out-of-stock') {
          <p class="stock__body">
            <strong>{{ data.productName }}</strong> has no units available.
            It can't be added to the current sale.
          </p>
        }
        @case ('at-limit') {
          <p class="stock__body">
            All <strong>{{ data.stock }}</strong> available
            <strong>"{{ data.productName }}"</strong> are already in the cart.
            No more units can be added.
          </p>
        }
        @case ('partial') {
          <p class="stock__body">
            You asked for <strong>{{ data.requested }}</strong>
            <strong>"{{ data.productName }}"</strong>, but only
            <strong>{{ data.added }}</strong> {{ data.added === 1 ? 'unit is' : 'units are' }}
            still available.
          </p>
          <p class="stock__note">
            <mat-icon class="stock__check">check_circle</mat-icon>
            Added {{ data.added }} to the cart.
          </p>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button color="primary" mat-dialog-close cdkFocusInitial>Got it</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .stock__title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0;
      }
      .stock__icon {
        color: var(--mat-sys-tertiary, #b45309);
        font-size: 1.75rem;
        width: 1.75rem;
        height: 1.75rem;
      }
      .stock__icon--error { color: var(--mat-sys-error); }
      .stock__body {
        margin: 0;
        line-height: 1.55;
        font-size: 1rem;
        color: var(--mat-sys-on-surface);
      }
      .stock__note {
        margin: 0.75rem 0 0;
        padding: 0.6rem 0.85rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        border-radius: 0.5rem;
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
        font-size: 0.9rem;
      }
      .stock__check {
        font-size: 1.15rem;
        width: 1.15rem;
        height: 1.15rem;
      }
    `,
  ],
})
export class StockLimitDialog {
  protected readonly data = inject<StockLimitDialogData>(MAT_DIALOG_DATA);

  protected title(): string {
    switch (this.data.reason) {
      case 'out-of-stock': return 'Out of stock';
      case 'at-limit':     return 'Stock limit reached';
      case 'partial':      return 'Not enough stock';
    }
  }
}
