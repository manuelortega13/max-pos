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
  LoadTransaction,
  LoadTransactionStatus,
} from '../../../core/models';
import { LoadService } from '../../../core/services/load.service';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

type StatusFilter = LoadTransactionStatus | 'all';

/**
 * Admin work queue for load transactions. Same UX as the GCash
 * cash-ins tab — defaults to the PENDING filter so the work
 * queue is what the admin sees on open.
 */
@Component({
  selector: 'app-load-transactions-tab',
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
  templateUrl: './load-transactions.tab.html',
  styleUrl: './load-transactions.tab.scss',
})
export class LoadTransactionsTab implements OnInit {
  private readonly loadService = inject(LoadService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly txns = signal<readonly LoadTransaction[]>([]);
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

  protected readonly rows = computed(() => {
    const f = this.statusFilter();
    return this.txns().filter((t) => {
      if (t.voidedAt) return f === 'all';
      if (f === 'all') return true;
      return t.status === f;
    });
  });

  protected readonly pendingCount = computed(
    () => this.txns().filter((t) => t.status === 'PENDING' && !t.voidedAt).length,
  );
  protected readonly completedCount = computed(
    () => this.txns().filter((t) => t.status === 'COMPLETED' && !t.voidedAt).length,
  );

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.loadService.listAll().subscribe({
      next: (rows) => {
        this.txns.set(rows);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err.error?.message ?? 'Could not load transactions.');
        this.loading.set(false);
      },
    });
  }

  protected setFilter(f: StatusFilter): void {
    this.statusFilter.set(f);
  }

  protected onPhoneCopied(success: boolean, phone: string | null): void {
    if (!phone) return;
    this.snackBar.open(
      success ? `Copied ${phone}` : 'Could not copy — clipboard blocked',
      'Dismiss',
      { duration: 2000 },
    );
  }

  protected confirmComplete(txn: LoadTransaction): void {
    const ref = this.dialog.open(ConfirmDialog, {
      width: '480px',
      data: {
        title: 'Mark load as completed',
        message:
          `Confirm that you've sent ${txn.amount.toFixed(2)}` +
          (txn.promo ? ` (${txn.promo})` : '') +
          ` to ${txn.customerPhone}. This can't be undone — to reverse, void instead.`,
        confirmLabel: 'Mark completed',
        icon: 'check_circle',
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.loadService.complete(txn.id).subscribe({
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

  protected confirmVoid(txn: LoadTransaction): void {
    const ref = this.dialog.open(ConfirmDialog, {
      width: '480px',
      data: {
        title: 'Void load',
        message:
          `Void ${txn.reference}? The cash collected at the till stays with the customer ` +
          `(refund it manually). Use this when the load send failed or the customer cancelled.`,
        confirmLabel: 'Void',
        destructive: true,
        icon: 'block',
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.loadService.void(txn.id).subscribe({
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
