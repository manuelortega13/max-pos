import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

/** Live preview totals computed by the parent page from currently loaded sales.
 *  The backend recomputes the canonical numbers on close, but the preview
 *  here is what the cashier counts against. */
export interface CloseDayDialogData {
  readonly openingFloat: number;
  readonly openedAtLabel: string;
  readonly cashSales: number;
  readonly cashRefunds: number;
  readonly cardSales: number;
  readonly transferSales: number;
  readonly creditSales: number;
  /** Cash collected as credit payments — adds to expected cash. */
  readonly cashCreditPayments: number;
  /** All credit payments (cash + card + transfer) — surfaced in
   *  the summary row even though only cash hits the drawer. */
  readonly totalCreditPayments: number;
  /** GCash buckets. All non-voided. Cash-in adds amount+fee to the
   *  drawer; cash-out removes amount, keeps fee. */
  readonly gcashCashInAmount: number;
  readonly gcashCashInFees: number;
  readonly gcashCashOutAmount: number;
  readonly gcashCashOutFees: number;
  /** Load buckets. Always cash-in for the till — amount + fee both
   *  add to the drawer. */
  readonly loadAmount: number;
  readonly loadFees: number;
  readonly totalSales: number;
  readonly totalRefunds: number;
  readonly salesCount: number;
  readonly itemsSold: number;
}

export interface CloseDayDialogResult {
  readonly countedCash: number;
  readonly notes: string | null;
}

@Component({
  selector: 'app-close-day-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="close-day__title">
      <mat-icon class="close-day__icon">event_busy</mat-icon>
      Close business day
    </h2>
    <mat-dialog-content class="close-day__content">
      <p class="close-day__opened">
        Opened {{ data.openedAtLabel }} with float
        <strong>{{ data.openingFloat | money }}</strong>.
      </p>

      <section class="close-day__section">
        <header>Sales</header>
        <dl>
          <div><dt>Transactions</dt><dd>{{ data.salesCount }}</dd></div>
          <div><dt>Items sold</dt><dd>{{ data.itemsSold }}</dd></div>
          <div><dt>Cash</dt><dd>{{ data.cashSales | money }}</dd></div>
          <div><dt>Card</dt><dd>{{ data.cardSales | money }}</dd></div>
          <div><dt>Transfer</dt><dd>{{ data.transferSales | money }}</dd></div>
          @if (data.creditSales > 0) {
            <div><dt>Credit</dt><dd>{{ data.creditSales | money }}</dd></div>
          }
          @if (data.totalCreditPayments > 0) {
            <div><dt>Credit payments received</dt><dd>+{{ data.totalCreditPayments | money }}</dd></div>
          }
          <div class="close-day__total"><dt>Total</dt><dd>{{ data.totalSales | money }}</dd></div>
          @if (data.totalRefunds > 0) {
            <div class="close-day__refund"><dt>Refunds</dt><dd>−{{ data.totalRefunds | money }}</dd></div>
          }
        </dl>
      </section>

      <mat-divider></mat-divider>

      <section class="close-day__section">
        <header>Cash drawer</header>
        <dl>
          <div><dt>Opening float</dt><dd>{{ data.openingFloat | money }}</dd></div>
          <div><dt>+ Cash sales</dt><dd>{{ data.cashSales | money }}</dd></div>
          @if (data.cashCreditPayments > 0) {
            <div><dt>+ Cash credit payments</dt><dd>{{ data.cashCreditPayments | money }}</dd></div>
          }
          @if (data.gcashCashInAmount > 0) {
            <div><dt>+ GCash cash-in</dt><dd>{{ data.gcashCashInAmount | money }}</dd></div>
          }
          @if (data.gcashCashInFees > 0) {
            <div><dt>+ GCash cash-in fees</dt><dd>{{ data.gcashCashInFees | money }}</dd></div>
          }
          @if (data.gcashCashOutFees > 0) {
            <div><dt>+ GCash cash-out fees</dt><dd>{{ data.gcashCashOutFees | money }}</dd></div>
          }
          @if (data.gcashCashOutAmount > 0) {
            <div><dt>− GCash cash-out</dt><dd>{{ data.gcashCashOutAmount | money }}</dd></div>
          }
          @if (data.loadAmount > 0) {
            <div><dt>+ Load amount</dt><dd>{{ data.loadAmount | money }}</dd></div>
          }
          @if (data.loadFees > 0) {
            <div><dt>+ Load fees</dt><dd>{{ data.loadFees | money }}</dd></div>
          }
          @if (data.cashRefunds > 0) {
            <div><dt>− Cash refunds</dt><dd>{{ data.cashRefunds | money }}</dd></div>
          }
          <div class="close-day__expected">
            <dt>Expected cash</dt>
            <dd>{{ expected() | money }}</dd>
          </div>
        </dl>

        <mat-form-field appearance="outline" class="close-day__field">
          <mat-label>Counted cash</mat-label>
          <input
            matInput
            type="number"
            inputmode="decimal"
            min="0"
            step="0.01"
            [ngModel]="counted()"
            (ngModelChange)="counted.set($event)"
            autofocus
          />
        </mat-form-field>

        @if (hasCountedCash()) {
          <p
            class="close-day__variance"
            [class.close-day__variance--off]="variance() !== 0"
          >
            Variance:
            <strong>
              @if (variance()! > 0) { + }
              {{ variance() | money }}
            </strong>
            @if (variance() === 0) {
              · matches expected
            } @else if (variance()! > 0) {
              · counted is OVER expected
            } @else {
              · counted is SHORT
            }
          </p>
        }
      </section>

      <mat-form-field appearance="outline" class="close-day__field">
        <mat-label>Notes (optional)</mat-label>
        <textarea
          matInput
          rows="2"
          maxlength="2048"
          placeholder="Why the variance? Anything unusual about the day?"
          [ngModel]="notes()"
          (ngModelChange)="notes.set($event)"
        ></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button mat-dialog-close>Cancel</button>
      <button
        mat-flat-button
        color="primary"
        [disabled]="!isValid()"
        (click)="confirm()"
      >
        Close day & print Z-report
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .close-day__title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0;
      }
      .close-day__icon { color: var(--mat-sys-error); }
      .close-day__content { display: flex; flex-direction: column; gap: 0.9rem; }
      .close-day__opened {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
      }
      .close-day__section {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;

        header {
          font-size: 0.75rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--mat-sys-primary);
          font-weight: 600;
        }

        dl {
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;

          > div {
            display: flex;
            justify-content: space-between;
            font-variant-numeric: tabular-nums;
          }

          dt, dd { margin: 0; }
          dt { color: var(--mat-sys-on-surface-variant); }
        }
      }
      .close-day__total {
        font-weight: 600;
        border-top: 1px solid var(--mat-sys-outline-variant);
        padding-top: 0.35rem;
        margin-top: 0.2rem;
      }
      .close-day__expected {
        font-weight: 600;
        border-top: 1px solid var(--mat-sys-outline-variant);
        padding-top: 0.35rem;
        margin-top: 0.2rem;
      }
      .close-day__refund { color: var(--mat-sys-error); }
      .close-day__field { width: 100%; }
      .close-day__variance {
        margin: 0;
        font-size: 0.95rem;
        padding: 0.5rem 0.75rem;
        border-radius: 0.5rem;
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .close-day__variance--off {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
    `,
  ],
})
export class CloseDayDialog {
  protected readonly data = inject<CloseDayDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<CloseDayDialog, CloseDayDialogResult>);

  protected readonly counted = signal<number | null>(null);
  protected readonly notes = signal<string>('');

  protected readonly expected = computed(
    () =>
      this.data.openingFloat +
      this.data.cashSales +
      this.data.cashCreditPayments +
      this.data.gcashCashInAmount +
      this.data.gcashCashInFees +
      this.data.gcashCashOutFees +
      this.data.loadAmount +
      this.data.loadFees -
      this.data.cashRefunds -
      this.data.gcashCashOutAmount,
  );
  protected readonly hasCountedCash = computed(() => {
    const c = this.counted();
    return c !== null && !Number.isNaN(c);
  });
  protected readonly variance = computed(() => {
    const c = this.counted();
    if (c === null || Number.isNaN(c)) return null;
    return c - this.expected();
  });
  protected readonly isValid = computed(() => {
    const c = this.counted();
    return c !== null && !Number.isNaN(c) && c >= 0;
  });

  protected confirm(): void {
    const c = this.counted();
    if (c === null || Number.isNaN(c) || c < 0) return;
    const trimmed = this.notes().trim();
    this.ref.close({ countedCash: c, notes: trimmed === '' ? null : trimmed });
  }
}
