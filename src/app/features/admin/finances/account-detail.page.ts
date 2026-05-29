import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import {
  ACCOUNT_KIND_LABELS,
  Account,
  AccountMovement,
  AccountReconciliation,
  AccountSummary,
  MOVEMENT_CATEGORY_LABELS,
  MovementSourceKind,
} from '../../../core/models';
import { FinanceService } from '../../../core/services/finance.service';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';
import { AccountFormDialog, AccountFormDialogData } from './account-form-dialog';
import { ReconcileDialog, ReconcileDialogData } from './reconcile-dialog';
import { RecordCashDialog, RecordCashDialogData } from './record-cash-dialog';
import { TransferDialog, TransferDialogData } from './transfer-dialog';

@Component({
  selector: 'app-finances-account-detail-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatChipsModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatTabsModule,
    MatTooltipModule,
    MoneyPipe,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-detail.page.html',
  styleUrl: './account-detail.page.scss',
})
export class FinancesAccountDetailPage implements OnInit {
  private readonly financeService = inject(FinanceService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly account = signal<Account | null>(null);
  protected readonly summary = signal<AccountSummary | null>(null);
  protected readonly allAccounts = signal<Account[]>([]);
  protected readonly movements = signal<AccountMovement[]>([]);
  protected readonly reconciliations = signal<AccountReconciliation[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly kindLabels = ACCOUNT_KIND_LABELS;
  protected readonly categoryLabels = MOVEMENT_CATEGORY_LABELS;

  protected readonly movementCols = [
    'occurredAt',
    'category',
    'note',
    'source',
    'amount',
    'actions',
  ] as const;

  protected readonly reconCols = [
    'countedAt',
    'expected',
    'counted',
    'variance',
    'note',
    'actions',
  ] as const;

  protected readonly activeMovements = computed(() =>
    this.movements().filter((m) => !m.voidedAt),
  );

  ngOnInit(): void {
    this.route.paramMap.subscribe((p) => {
      const id = p.get('id');
      if (id) this.reload(id);
    });
  }

  protected reload(id?: string): void {
    const accountId = id ?? this.account()?.id;
    if (!accountId) return;
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      account: this.financeService.getAccount(accountId),
      accounts: this.financeService.listAccounts(),
      overview: this.financeService.overview(),
      movements: this.financeService.listMovements({ accountId }),
      reconciliations: this.financeService.listReconciliations(accountId),
    }).subscribe({
      next: ({ account, accounts, overview, movements, reconciliations }) => {
        this.account.set(account);
        this.allAccounts.set(accounts);
        this.summary.set(
          overview.accounts.find((a) => a.id === accountId) ?? null,
        );
        this.movements.set(movements);
        this.reconciliations.set(reconciliations);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Could not load account.');
      },
    });
  }

  protected openRecordIn(): void {
    const acct = this.account();
    if (!acct) return;
    this.dialog
      .open<RecordCashDialog, RecordCashDialogData, AccountMovement>(RecordCashDialog, {
        data: {
          direction: 'IN',
          accounts: this.allAccounts().filter((a) => a.active),
          defaultAccountId: acct.id,
        },
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((res) => res && this.reload());
  }

  protected openRecordOut(): void {
    const acct = this.account();
    if (!acct) return;
    this.dialog
      .open<RecordCashDialog, RecordCashDialogData, AccountMovement>(RecordCashDialog, {
        data: {
          direction: 'OUT',
          accounts: this.allAccounts().filter((a) => a.active),
          defaultAccountId: acct.id,
        },
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((res) => res && this.reload());
  }

  protected openTransfer(): void {
    const acct = this.account();
    if (!acct) return;
    this.dialog
      .open<TransferDialog, TransferDialogData, AccountMovement[]>(TransferDialog, {
        data: {
          accounts: this.allAccounts().filter((a) => a.active),
          defaultFromAccountId: acct.id,
        },
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((res) => res && this.reload());
  }

  protected openReconcile(): void {
    const acct = this.account();
    const sum = this.summary();
    if (!acct || !sum) return;
    this.dialog
      .open<ReconcileDialog, ReconcileDialogData, AccountReconciliation>(
        ReconcileDialog,
        {
          data: {
            accountId: acct.id,
            accountName: acct.name,
            expectedAmount: sum.balance,
          },
          autoFocus: false,
        },
      )
      .afterClosed()
      .subscribe((res) => res && this.reload());
  }

  protected openEdit(): void {
    const acct = this.account();
    if (!acct) return;
    this.dialog
      .open<AccountFormDialog, AccountFormDialogData, Account>(AccountFormDialog, {
        data: { account: acct },
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((res) => res && this.reload());
  }

  /** Only MANUAL and TRANSFER movements can be voided directly —
   *  the rest carry source-row references and must be undone at
   *  the source (refund a sale, void an expense, etc.). */
  protected canVoidMovement(m: AccountMovement): boolean {
    if (m.voidedAt) return false;
    return m.sourceKind === 'MANUAL' || m.sourceKind === 'TRANSFER';
  }

  protected voidMovement(m: AccountMovement): void {
    this.dialog
      .open<ConfirmDialog, { title: string; message: string }, boolean>(ConfirmDialog, {
        data: {
          title: 'Void movement?',
          message:
            m.sourceKind === 'TRANSFER'
              ? 'Voiding will reverse both legs of the transfer.'
              : 'This will reverse the recorded amount on the balance.',
        },
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.financeService.voidMovement(m.id).subscribe({
          next: () => {
            this.snackBar.open('Movement voided', 'Dismiss', { duration: 2000 });
            this.reload();
          },
          error: (err: HttpErrorResponse) => {
            this.snackBar.open(
              err.error?.message ?? 'Could not void movement.',
              'Dismiss',
              { duration: 3500 },
            );
          },
        });
      });
  }

  protected voidReconciliation(r: AccountReconciliation): void {
    this.dialog
      .open<ConfirmDialog, { title: string; message: string }, boolean>(ConfirmDialog, {
        data: {
          title: 'Void reconciliation?',
          message:
            'This reverses the paired adjustment so the balance returns to what it was before the count.',
        },
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.financeService.voidReconciliation(r.id).subscribe({
          next: () => {
            this.snackBar.open('Reconciliation voided', 'Dismiss', { duration: 2000 });
            this.reload();
          },
          error: (err: HttpErrorResponse) => {
            this.snackBar.open(
              err.error?.message ?? 'Could not void reconciliation.',
              'Dismiss',
              { duration: 3500 },
            );
          },
        });
      });
  }

  protected categoryLabel(c: string): string {
    return this.categoryLabels[c] ?? c;
  }

  protected sourceLabel(s: MovementSourceKind): string {
    const map: Record<MovementSourceKind, string> = {
      SALE: 'Sale',
      REFUND: 'Refund',
      GCASH_TXN: 'GCash',
      LOAD_TXN: 'Load',
      EXPENSE: 'Expense',
      CREDITOR_PAYMENT: 'Credit payment',
      FLOAT_ADDITION: 'Float top-up',
      OPENING_FLOAT: 'Opening float',
      MANUAL: 'Manual',
      TRANSFER: 'Transfer',
      RECONCILE: 'Reconcile',
    };
    return map[s] ?? s;
  }
}
