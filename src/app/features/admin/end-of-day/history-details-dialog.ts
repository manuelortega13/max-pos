import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { BusinessDay } from '../../../core/models';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

export interface HistoryDetailsDialogData {
  readonly day: BusinessDay;
  /** Whether the latest-reopen action is allowed for this row. The
   *  parent already does the latest-closed + no-other-open check;
   *  this dialog just shows/hides the button accordingly. Clicking
   *  closes the dialog with `'reopen'` so the parent can trigger
   *  the actual API call. */
  readonly canReopen: boolean;
}

export type HistoryDetailsDialogResult = 'reopen' | 'reprint' | undefined;

/**
 * Read-only Z-report-style view of a closed business day. Mirrors
 * the layout admins see on paper so they can quickly verify a past
 * day's reconciliation without going through the printer.
 */
@Component({
  selector: 'app-history-details-dialog',
  imports: [
    DatePipe,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatDividerModule,
    MatIconModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="hdd__title">
      <mat-icon>event_note</mat-icon>
      Day details
    </h2>

    <mat-dialog-content class="hdd__content">
      <header class="hdd__meta">
        <div>
          <small>Opened</small>
          <strong>{{ day.openedAt | date: 'mediumDate' }} · {{ day.openedAt | date: 'shortTime' }}</strong>
          <small>by {{ day.openedByName }}</small>
        </div>
        <div>
          <small>Closed</small>
          @if (day.closedAt) {
            <strong>{{ day.closedAt | date: 'mediumDate' }} · {{ day.closedAt | date: 'shortTime' }}</strong>
            <small>by {{ day.closedByName ?? '—' }}</small>
          } @else {
            <mat-chip disableRipple>open</mat-chip>
          }
        </div>
      </header>

      <section class="hdd__section">
        <header>Sales</header>
        <dl>
          <div><dt>Transactions</dt><dd>{{ day.salesCount ?? 0 }}</dd></div>
          <div><dt>Items sold</dt><dd>{{ day.itemsSold ?? 0 }}</dd></div>
          <div><dt>Cash</dt><dd>{{ (day.cashSales ?? 0) | money }}</dd></div>
          <div><dt>Card</dt><dd>{{ (day.cardSales ?? 0) | money }}</dd></div>
          <div><dt>Transfer</dt><dd>{{ (day.transferSales ?? 0) | money }}</dd></div>
          @if ((day.creditSales ?? 0) > 0) {
            <div><dt>Credit</dt><dd>{{ day.creditSales | money }}</dd></div>
          }
          @if (gcashSalesShown()) {
            <div><dt>GCash cash-in</dt><dd>{{ (day.gcashCashInAmount ?? 0) | money }}</dd></div>
            <div><dt>GCash cash-out</dt><dd>{{ (day.gcashCashOutAmount ?? 0) | money }}</dd></div>
            @if (gcashFeesTotal() > 0) {
              <div><dt>GCash fees</dt><dd>+{{ gcashFeesTotal() | money }}</dd></div>
            }
          }
          @if ((day.loadAmount ?? 0) > 0) {
            <div><dt>Load</dt><dd>{{ day.loadAmount | money }}</dd></div>
          }
          @if ((day.loadFees ?? 0) > 0) {
            <div><dt>Load fees</dt><dd>+{{ day.loadFees | money }}</dd></div>
          }
          <div class="hdd__total"><dt>Total sales</dt><dd>{{ (day.totalSales ?? 0) | money }}</dd></div>
          @if ((day.totalRefunds ?? 0) > 0) {
            <div class="hdd__refund"><dt>Refunds</dt><dd>−{{ day.totalRefunds | money }}</dd></div>
          }
        </dl>
      </section>

      <mat-divider></mat-divider>

      <section class="hdd__section">
        <header>Cash drawer</header>
        <dl>
          <div><dt>Opening float</dt><dd>{{ day.openingFloat | money }}</dd></div>
          @if ((day.floatAdditions ?? 0) > 0) {
            <div><dt>+ Float top-ups</dt><dd>{{ day.floatAdditions | money }}</dd></div>
          }
          <div><dt>+ Cash sales</dt><dd>{{ (day.cashSales ?? 0) | money }}</dd></div>
          @if ((day.cashCreditPayments ?? 0) > 0) {
            <div><dt>+ Cash credit payments</dt><dd>{{ day.cashCreditPayments | money }}</dd></div>
          }
          @if ((day.gcashCashInAmount ?? 0) > 0) {
            <div><dt>+ GCash cash-in</dt><dd>{{ day.gcashCashInAmount | money }}</dd></div>
          }
          @if ((day.gcashCashInFees ?? 0) > 0) {
            <div><dt>+ GCash in fees</dt><dd>{{ day.gcashCashInFees | money }}</dd></div>
          }
          @if ((day.gcashCashOutFees ?? 0) > 0) {
            <div><dt>+ GCash out fees</dt><dd>{{ day.gcashCashOutFees | money }}</dd></div>
          }
          @if ((day.loadAmount ?? 0) > 0) {
            <div><dt>+ Load amount</dt><dd>{{ day.loadAmount | money }}</dd></div>
          }
          @if ((day.loadFees ?? 0) > 0) {
            <div><dt>+ Load fees</dt><dd>{{ day.loadFees | money }}</dd></div>
          }
          @if ((day.gcashCashOutAmount ?? 0) > 0) {
            <div class="hdd__refund"><dt>− GCash cash-out</dt><dd>{{ day.gcashCashOutAmount | money }}</dd></div>
          }
          @if ((day.cashRefunds ?? 0) > 0) {
            <div class="hdd__refund"><dt>− Cash refunds</dt><dd>{{ day.cashRefunds | money }}</dd></div>
          }
          <div class="hdd__total"><dt>Expected cash</dt><dd>{{ (day.expectedCash ?? 0) | money }}</dd></div>
          <div><dt>Counted cash</dt><dd>{{ (day.countedCash ?? 0) | money }}</dd></div>
          <div
            class="hdd__variance"
            [class.hdd__variance--off]="(day.variance ?? 0) !== 0"
          >
            <dt>Variance</dt>
            <dd>
              @if ((day.variance ?? 0) > 0) { + }{{ (day.variance ?? 0) | money }}
              @if ((day.variance ?? 0) > 0) {
                <small>over expected</small>
              } @else if ((day.variance ?? 0) < 0) {
                <small>short vs expected</small>
              }
            </dd>
          </div>
        </dl>
      </section>

      @if (day.notes) {
        <mat-divider></mat-divider>
        <section class="hdd__section">
          <header>Notes</header>
          <p class="hdd__notes">{{ day.notes }}</p>
        </section>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-stroked-button mat-dialog-close>Close</button>
      @if (day.closedAt) {
        <button mat-stroked-button (click)="dialogRef.close('reprint')">
          <mat-icon>print</mat-icon>
          Reprint Z-report
        </button>
      }
      @if (data.canReopen) {
        <button mat-flat-button color="warn" (click)="dialogRef.close('reopen')">
          <mat-icon>lock_open</mat-icon>
          Reopen day
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: [
    `
      .hdd__title {
        display: flex; align-items: center; gap: 0.5rem; margin: 0;
      }
      .hdd__content {
        display: flex; flex-direction: column; gap: 1rem;
        min-width: min(36rem, 92vw);
      }
      .hdd__meta {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
        padding: 0.85rem 1rem;
        border-radius: 0.5rem;
        background: var(--mat-sys-surface-container-low);

        > div {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        small {
          font-size: 0.72rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--mat-sys-on-surface-variant);
        }
        strong { font-size: 0.95rem; font-variant-numeric: tabular-nums; }
      }
      .hdd__section {
        display: flex; flex-direction: column; gap: 0.5rem;

        > header {
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
            gap: 0.5rem;
            font-variant-numeric: tabular-nums;
            font-size: 0.9rem;
          }
          dt, dd { margin: 0; }
          dt { color: var(--mat-sys-on-surface-variant); }
          dd { text-align: right; }
        }
      }
      .hdd__total {
        font-weight: 600;
        border-top: 1px solid var(--mat-sys-outline-variant);
        padding-top: 0.35rem;
        margin-top: 0.2rem;
      }
      .hdd__refund { color: var(--mat-sys-error); }
      .hdd__variance {
        font-weight: 600;
        margin-top: 0.4rem;
        padding-top: 0.35rem;
        border-top: 1px solid var(--mat-sys-outline-variant);

        dd small {
          display: block;
          font-weight: 400;
          font-size: 0.7rem;
          color: var(--mat-sys-on-surface-variant);
        }
      }
      .hdd__variance--off dd {
        color: var(--mat-sys-error);
      }
      .hdd__notes {
        margin: 0;
        padding: 0.6rem 0.85rem;
        background: var(--mat-sys-surface-container);
        border-radius: 0.5rem;
        font-size: 0.9rem;
        line-height: 1.4;
        white-space: pre-wrap;
      }
    `,
  ],
})
export class HistoryDetailsDialog {
  protected readonly data = inject<HistoryDetailsDialogData>(MAT_DIALOG_DATA);
  protected readonly dialogRef = inject(
    MatDialogRef<HistoryDetailsDialog, HistoryDetailsDialogResult>,
  );

  protected readonly day = this.data.day;

  protected readonly gcashSalesShown = computed(
    () => (this.day.gcashCashInAmount ?? 0) > 0 || (this.day.gcashCashOutAmount ?? 0) > 0,
  );

  protected readonly gcashFeesTotal = computed(
    () => (this.day.gcashCashInFees ?? 0) + (this.day.gcashCashOutFees ?? 0),
  );
}
