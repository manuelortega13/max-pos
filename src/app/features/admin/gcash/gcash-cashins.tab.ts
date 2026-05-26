import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ClipboardModule } from '@angular/cdk/clipboard';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  GcashTransaction,
  GcashTransactionStatus,
} from '../../../core/models';
import { GcashService } from '../../../core/services/gcash.service';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

type StatusFilter = GcashTransactionStatus | 'all';

/**
 * Admin work queue for cash-in transactions. The cashier collects
 * cash at the till and records the row as PENDING; this page is
 * where the admin actually sends the GCash from their phone, then
 * marks the row COMPLETED.
 *
 * Defaults to the PENDING filter so the work queue is the first
 * thing the admin sees on open. Switching to "All" or "Completed"
 * shows history for audit / reprint.
 */
@Component({
  selector: 'app-gcash-cashins-tab',
  imports: [
    ClipboardModule,
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gcash-cashins.tab.html',
  styleUrl: './gcash-cashins.tab.scss',
})
export class GcashCashinsTab implements OnInit {
  private readonly gcashService = inject(GcashService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly txns = signal<readonly GcashTransaction[]>([]);
  protected readonly statusFilter = signal<StatusFilter>('PENDING');

  protected readonly columns = [
    'ref',
    'date',
    'customer',
    'amount',
    'fee',
    'status',
    'actions',
  ] as const;

  /** Only CASH_IN rows — the cashier UI handles cash-out as instant. */
  protected readonly cashIns = computed(() =>
    this.txns().filter((t) => t.type === 'CASH_IN'),
  );

  protected readonly rows = computed(() => {
    const f = this.statusFilter();
    return this.cashIns().filter((t) => {
      if (t.voidedAt) return f === 'all';
      if (f === 'all') return true;
      return t.status === f;
    });
  });

  protected readonly pendingCount = computed(
    () => this.cashIns().filter((t) => t.status === 'PENDING' && !t.voidedAt).length,
  );
  protected readonly completedCount = computed(
    () => this.cashIns().filter((t) => t.status === 'COMPLETED' && !t.voidedAt).length,
  );

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.gcashService.listAll().subscribe({
      next: (rows) => {
        this.txns.set(rows);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err.error?.message ?? 'Could not load cash-ins.');
        this.loading.set(false);
      },
    });
  }

  protected setFilter(f: StatusFilter): void {
    this.statusFilter.set(f);
  }

  /** cdkCopyToClipboardCopied fires with `true` on success, `false`
   *  if the browser blocked the write (e.g. non-secure context). */
  protected onPhoneCopied(success: boolean, phone: string | null): void {
    if (!phone) return;
    this.snackBar.open(
      success ? `Copied ${phone}` : 'Could not copy — clipboard blocked',
      'Dismiss',
      { duration: 2000 },
    );
  }

  protected confirmComplete(txn: GcashTransaction): void {
    const phone = txn.customerPhone ?? '—';
    const ref = this.dialog.open(ConfirmDialog, {
      width: '480px',
      data: {
        title: 'Mark cash-in as completed',
        message:
          `Confirm that you've sent ${txn.amount.toFixed(2)} via GCash to ${phone}` +
          (txn.customerName ? ` (${txn.customerName})` : '') +
          `. This can't be undone — to reverse, void the transaction instead.`,
        confirmLabel: 'Mark completed',
        icon: 'check_circle',
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.gcashService.complete(txn.id).subscribe({
        next: () => {
          this.snackBar.open(`Marked ${txn.reference} as completed`, 'Dismiss', {
            duration: 2500,
          });
          this.load();
        },
        error: (err: HttpErrorResponse) => {
          this.snackBar.open(err.error?.message ?? 'Could not complete.', 'Dismiss', {
            duration: 4000,
          });
        },
      });
    });
  }

  protected confirmVoid(txn: GcashTransaction): void {
    const ref = this.dialog.open(ConfirmDialog, {
      width: '480px',
      data: {
        title: 'Void cash-in',
        message:
          `Void ${txn.reference}? The cash collected at the till stays with the customer ` +
          `(refund it manually). This is for cases where the GCash send failed or the ` +
          `customer cancelled before delivery.`,
        confirmLabel: 'Void',
        destructive: true,
        icon: 'block',
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.gcashService.void(txn.id).subscribe({
        next: () => {
          this.snackBar.open(`Voided ${txn.reference}`, 'Dismiss', { duration: 2500 });
          this.load();
        },
        error: (err: HttpErrorResponse) => {
          this.snackBar.open(err.error?.message ?? 'Void failed.', 'Dismiss', {
            duration: 4000,
          });
        },
      });
    });
  }
}
