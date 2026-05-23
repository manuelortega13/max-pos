import { DatePipe, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { Sale } from '../../core/models';
import { MoneyPipe } from '../pipes/currency-symbol.pipe';

/**
 * Read-only viewer for a sale's line items + totals. Opened from
 * either the admin Sales page or the cashier My Transactions page —
 * same shape, same dialog. No mutation, no actions; pure detail view.
 */
@Component({
  selector: 'app-sale-items-dialog',
  imports: [
    DatePipe,
    TitleCasePipe,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatDividerModule,
    MatIconModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="items__title">
      <mat-icon>receipt_long</mat-icon>
      <span class="items__title-text">
        Sale {{ sale.reference }}
        <small>{{ sale.date | date: 'medium' }}</small>
      </span>
      <mat-chip
        class="items__status"
        [class]="'status-chip status-chip--' + sale.status.toLowerCase()"
        disableRipple
      >
        {{ sale.status | titlecase }}
      </mat-chip>
    </h2>

    <mat-dialog-content class="items__content">
      <div class="items__meta">
        <div>
          <small>Cashier</small>
          <strong>{{ sale.cashierName }}</strong>
        </div>
        <div>
          <small>Payment</small>
          <strong>{{ sale.paymentMethod | titlecase }}</strong>
        </div>
        <div>
          <small>Items sold</small>
          <strong>{{ totalItemQty() }}</strong>
        </div>
      </div>

      <mat-divider></mat-divider>

      <table class="items__table">
        <thead>
          <tr>
            <th>Product</th>
            <th class="items__num">Qty</th>
            <th class="items__num">Unit</th>
            <th class="items__num">Line total</th>
          </tr>
        </thead>
        <tbody>
          @for (item of sale.items; track item.productId) {
            <tr>
              <td>{{ item.productName }}</td>
              <td class="items__num">×{{ item.quantity }}</td>
              <td class="items__num">{{ item.unitPrice | money }}</td>
              <td class="items__num items__line-total">
                @if (item.discountAmount && item.discountAmount > 0) {
                  <span class="items__strike">
                    {{ item.unitPrice * item.quantity | money }}
                  </span>
                }
                {{ item.subtotal | money }}
              </td>
            </tr>
          }
        </tbody>
      </table>

      <mat-divider></mat-divider>

      <dl class="items__totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{{ sale.subtotal | money }}</dd>
        </div>
        @if (sale.discountAmount && sale.discountAmount > 0) {
          <div class="items__discount">
            <dt>Order discount</dt>
            <dd>−{{ sale.discountAmount | money }}</dd>
          </div>
        }
        @if (sale.tax > 0) {
          <div>
            <dt>Tax</dt>
            <dd>{{ sale.tax | money }}</dd>
          </div>
        }
        <div class="items__grand">
          <dt>Total</dt>
          <dd>{{ sale.total | money }}</dd>
        </div>
      </dl>

      @if (sale.refundReason) {
        <div class="items__refund">
          <mat-icon>undo</mat-icon>
          <div>
            <strong>Refund reason</strong>
            <small>{{ sale.refundReason }}</small>
          </div>
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-flat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .items__title {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin: 0;
        font-size: 1.05rem;
        min-width: 0;
      }
      .items__title-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        line-height: 1.25;
        gap: 0.15rem;
        /* Long references shrink + ellipsize instead of wrapping into a
           second row that crowds the top corner. */
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        small {
          font-size: 0.8rem;
          color: var(--mat-sys-on-surface-variant);
          font-weight: 400;
        }
      }
      .items__status {
        flex-shrink: 0;
      }

      .items__content {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
        min-width: min(32rem, 90vw);
      }

      .items__meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
        gap: 0.85rem;

        div {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          padding: 0.5rem 0.65rem;
          border-radius: 0.5rem;
          background: var(--mat-sys-surface-container-low);
        }
        small {
          font-size: 0.7rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--mat-sys-on-surface-variant);
        }
      }

      .items__table {
        width: 100%;
        border-collapse: collapse;
        font-variant-numeric: tabular-nums;

        th, td {
          padding: 0.55rem 0.5rem;
          text-align: left;
          border-bottom: 1px solid var(--mat-sys-outline-variant);
        }
        th {
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--mat-sys-on-surface-variant);
        }
        tbody tr:last-child td {
          border-bottom: 0;
        }
      }
      .items__num { text-align: right; }
      .items__line-total {
        font-weight: 600;
        display: flex;
        align-items: baseline;
        justify-content: flex-end;
        gap: 0.4rem;
      }
      .items__strike {
        font-weight: 400;
        font-size: 0.85rem;
        color: var(--mat-sys-on-surface-variant);
        text-decoration: line-through;
      }

      .items__totals {
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-variant-numeric: tabular-nums;

        > div {
          display: flex;
          justify-content: space-between;
        }
        dt, dd { margin: 0; }
        dt { color: var(--mat-sys-on-surface-variant); }
      }
      .items__discount { color: var(--mat-sys-tertiary); }
      .items__grand {
        font-size: 1.15rem;
        font-weight: 700;
        border-top: 2px solid var(--mat-sys-outline-variant);
        padding-top: 0.45rem;
        margin-top: 0.25rem;

        dd { color: var(--mat-sys-primary); }
      }

      .items__refund {
        display: flex;
        gap: 0.6rem;
        align-items: flex-start;
        padding: 0.7rem 0.85rem;
        border-radius: 0.5rem;
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);

        mat-icon { flex-shrink: 0; }
        strong { display: block; }
        small { display: block; font-size: 0.85rem; }
      }
    `,
  ],
})
export class SaleItemsDialog {
  protected readonly sale = inject<Sale>(MAT_DIALOG_DATA);
  protected readonly totalItemQty = computed(() =>
    this.sale.items.reduce((n, i) => n + i.quantity, 0),
  );
}
