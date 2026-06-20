import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
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
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { catchError, debounceTime, of, switchMap, tap } from 'rxjs';
import {
  ACCOUNT_KIND_LABELS,
  Account,
  AccountMovement,
  AccountSummary,
  FinanceOverview,
  MOVEMENT_CATEGORY_LABELS,
  Page,
} from '../../../core/models';
import { FinanceService } from '../../../core/services/finance.service';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';
import { AccountFormDialog, AccountFormDialogData } from './account-form-dialog';
import { RecordCashDialog, RecordCashDialogData } from './record-cash-dialog';
import { TransferDialog, TransferDialogData } from './transfer-dialog';

/**
 * Finances overview — top-of-the-funnel view of the business's
 * cash + e-wallet + bank balances. Each account is a card; tapping
 * a card opens the drill-in page (movements + reconcile).
 *
 * The headline pulls {@code net} (sum of active balances) and a
 * 30-day in/out total (transfers excluded). The activity table
 * underneath is the all-account movement feed, server-paginated and
 * filterable by search (note/category) and date range.
 */
@Component({
  selector: 'app-finances-page',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
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
    MatTooltipModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './finances.page.html',
  styleUrl: './finances.page.scss',
})
export class FinancesPage {
  private readonly financeService = inject(FinanceService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly overview = signal<FinanceOverview | null>(null);
  protected readonly accounts = signal<Account[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly kindLabels = ACCOUNT_KIND_LABELS;
  protected readonly categoryLabels = MOVEMENT_CATEGORY_LABELS;

  /** Visible accounts (active and inactive both shown — inactive
   *  carry a chip and faded balance to avoid surprise when admin
   *  toggles them back on). */
  protected readonly visibleAccounts = computed(() => this.overview()?.accounts ?? []);

  protected readonly recentCols = ['occurredAt', 'account', 'category', 'note', 'amount'] as const;

  // ─── Filters ──────────────────────────────────────────────────
  protected readonly search = signal('');
  protected readonly fromDate = signal<Date | null>(null);
  protected readonly toDate = signal<Date | null>(null);
  protected readonly today = new Date();

  /** `from` as an ISO instant at the start of the picked local day. */
  private readonly fromIso = computed(() => {
    const d = this.fromDate();
    return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString() : undefined;
  });

  /** `to` as an ISO instant at the start of the day AFTER the picked local
   *  day — an exclusive upper bound so the whole 'to' day is included. */
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

  /** Bumped to force a re-fetch of the current page after a mutation
   *  (record in/out, transfer) without changing any filter. */
  private readonly reloadTick = signal(0);

  private readonly emptyPage: Page<AccountMovement> = {
    content: [],
    page: 0,
    size: 10,
    totalElements: 0,
    totalPages: 0,
  };

  private readonly queryParams = computed(() => ({
    search: this.search().trim(),
    from: this.fromIso(),
    to: this.toIso(),
    page: this.pageIndex(),
    size: this.pageSize(),
    tick: this.reloadTick(),
  }));

  /**
   * The current page of the all-account feed, fetched server-side.
   * Debounced so typing in the search box collapses into one request;
   * {@code switchMap} cancels any in-flight request superseded by a newer
   * one. Errors fall back to an empty page.
   */
  private readonly pageData = toSignal(
    toObservable(this.queryParams).pipe(
      debounceTime(200),
      switchMap((q) => {
        this.fetching.set(true);
        return this.financeService
          .searchMovements({ search: q.search, from: q.from, to: q.to, page: q.page, size: q.size })
          .pipe(catchError(() => of(this.emptyPage)));
      }),
      tap(() => this.fetching.set(false)),
    ),
    { initialValue: this.emptyPage },
  );

  protected readonly rows = computed(() => this.pageData().content);
  protected readonly total = computed(() => this.pageData().totalElements);

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.financeService.overview().subscribe({
      next: (overview) => {
        this.overview.set(overview);
        // Drive dialogs (need full Account, not just summary).
        this.financeService.listAccounts().subscribe({
          next: (rows) => this.accounts.set(rows),
        });
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Could not load finances.');
      },
    });
  }

  /** After a mutation, refresh balances/overview and re-fetch the feed. */
  private afterMutation(): void {
    this.reload();
    this.reloadTick.update((t) => t + 1);
  }

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  /** Filter mutators reset to the first page — a narrower filter could
   *  otherwise leave the view past the new last page. */
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
    this.dialog
      .open<RecordCashDialog, RecordCashDialogData, AccountMovement>(RecordCashDialog, {
        data: { direction: 'IN', accounts: this.activeAccounts() },
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((res) => res && this.afterMutation());
  }

  protected openRecordOut(): void {
    this.dialog
      .open<RecordCashDialog, RecordCashDialogData, AccountMovement>(RecordCashDialog, {
        data: { direction: 'OUT', accounts: this.activeAccounts() },
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((res) => res && this.afterMutation());
  }

  protected openTransfer(): void {
    this.dialog
      .open<TransferDialog, TransferDialogData, AccountMovement[]>(TransferDialog, {
        data: { accounts: this.activeAccounts() },
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((res) => res && this.afterMutation());
  }

  protected openNewAccount(): void {
    this.dialog
      .open<AccountFormDialog, AccountFormDialogData, Account>(AccountFormDialog, {
        data: { account: null },
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((res) => res && this.afterMutation());
  }

  protected editAccount(summary: AccountSummary): void {
    const full = this.accounts().find((a) => a.id === summary.id);
    if (!full) return;
    this.dialog
      .open<AccountFormDialog, AccountFormDialogData, Account>(AccountFormDialog, {
        data: { account: full },
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((res) => res && this.afterMutation());
  }

  protected goToAccount(id: string): void {
    this.router.navigate(['/admin/finances', id]);
  }

  protected categoryLabel(c: string): string {
    return this.categoryLabels[c] ?? c;
  }

  private activeAccounts(): Account[] {
    return this.accounts().filter((a) => a.active);
  }
}
