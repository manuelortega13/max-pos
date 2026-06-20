import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, of, debounceTime, switchMap, tap } from 'rxjs';
import {
  ACCOUNT_KIND_LABELS,
  Account,
  AccountMovement,
  AccountReconciliation,
  AccountSummary,
  MOVEMENT_CATEGORY_LABELS,
  MovementSourceKind,
  Page,
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
    FormsModule,
    MatButtonModule,
    MatChipsModule,
    MatDatepickerModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
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
  protected readonly reconciliations = signal<AccountReconciliation[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Current account id, from the route. Drives the paged movement feed. */
  private readonly accountId = signal<string | null>(null);

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

  // ─── Movement filters ─────────────────────────────────────────
  protected readonly search = signal('');
  protected readonly fromDate = signal<Date | null>(null);
  protected readonly toDate = signal<Date | null>(null);
  protected readonly today = new Date();

  private readonly fromIso = computed(() => {
    const d = this.fromDate();
    return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString() : undefined;
  });

  private readonly toIso = computed(() => {
    const d = this.toDate();
    return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString() : undefined;
  });

  protected readonly hasDateFilter = computed(
    () => this.fromDate() !== null || this.toDate() !== null,
  );

  // ─── Pagination ───────────────────────────────────────────────
  protected readonly pageSizeOptions = [10, 25, 50, 100];
  protected readonly pageSize = signal(10);
  protected readonly pageIndex = signal(0);

  private readonly fetching = signal(false);
  protected readonly movementsLoading = this.fetching.asReadonly();

  /** Bumped to force a re-fetch of the current page after a mutation. */
  private readonly reloadTick = signal(0);

  private readonly emptyPage: Page<AccountMovement> = {
    content: [],
    page: 0,
    size: 10,
    totalElements: 0,
    totalPages: 0,
  };

  private readonly queryParams = computed(() => ({
    accountId: this.accountId(),
    search: this.search().trim(),
    from: this.fromIso(),
    to: this.toIso(),
    page: this.pageIndex(),
    size: this.pageSize(),
    tick: this.reloadTick(),
  }));

  /** Current page of this account's movements, server-side. Skips the
   *  request until the route account id is known. */
  private readonly pageData = toSignal(
    toObservable(this.queryParams).pipe(
      debounceTime(200),
      switchMap((q) => {
        if (!q.accountId) return of(this.emptyPage);
        this.fetching.set(true);
        return this.financeService
          .searchMovements({
            accountId: q.accountId,
            search: q.search,
            from: q.from,
            to: q.to,
            page: q.page,
            size: q.size,
          })
          .pipe(catchError(() => of(this.emptyPage)));
      }),
      tap(() => this.fetching.set(false)),
    ),
    { initialValue: this.emptyPage },
  );

  protected readonly movements = computed(() => this.pageData().content);
  protected readonly total = computed(() => this.pageData().totalElements);

  ngOnInit(): void {
    this.route.paramMap.subscribe((p) => {
      const id = p.get('id');
      if (id) {
        // Reset paging when switching accounts so we never land past the
        // new account's last page.
        this.pageIndex.set(0);
        this.accountId.set(id);
        this.reload(id);
      }
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
      reconciliations: this.financeService.listReconciliations(accountId),
    }).subscribe({
      next: ({ account, accounts, overview, reconciliations }) => {
        this.account.set(account);
        this.allAccounts.set(accounts);
        this.summary.set(overview.accounts.find((a) => a.id === accountId) ?? null);
        this.reconciliations.set(reconciliations);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Could not load account.');
      },
    });
  }

  /** After a mutation, refresh account/summary/reconciliations and
   *  re-fetch the movements page. */
  private afterMutation(): void {
    this.reload();
    this.reloadTick.update((t) => t + 1);
  }

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  protected setSearch(value: string): void {
    this.search.set(value);
    this.pageIndex.set(0);
  }

  protected setFromDate(value: Date | null): void {
    this.fromDate.set(value);
    if (value && this.toDate() === null) this.toDate.set(value);
    this.pageIndex.set(0);
  }

  protected setToDate(value: Date | null): void {
    this.toDate.set(value);
    this.pageIndex.set(0);
  }

  protected clearDates(): void {
    this.fromDate.set(null);
    this.toDate.set(null);
    this.pageIndex.set(0);
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
      .subscribe((res) => res && this.afterMutation());
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
      .subscribe((res) => res && this.afterMutation());
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
      .subscribe((res) => res && this.afterMutation());
  }

  protected openReconcile(): void {
    const acct = this.account();
    const sum = this.summary();
    if (!acct || !sum) return;
    this.dialog
      .open<ReconcileDialog, ReconcileDialogData, AccountReconciliation>(ReconcileDialog, {
        data: {
          accountId: acct.id,
          accountName: acct.name,
          expectedAmount: sum.balance,
        },
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((res) => res && this.afterMutation());
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
      .subscribe((res) => res && this.afterMutation());
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
            this.afterMutation();
          },
          error: (err: HttpErrorResponse) => {
            this.snackBar.open(err.error?.message ?? 'Could not void movement.', 'Dismiss', {
              duration: 3500,
            });
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
            this.afterMutation();
          },
          error: (err: HttpErrorResponse) => {
            this.snackBar.open(err.error?.message ?? 'Could not void reconciliation.', 'Dismiss', {
              duration: 3500,
            });
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
