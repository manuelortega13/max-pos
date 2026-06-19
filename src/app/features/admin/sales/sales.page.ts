import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { catchError, debounceTime, of, switchMap, tap } from 'rxjs';
import { Page, SaleStatus, TransactionKind, TransactionRow } from '../../../core/models';
import { SaleService } from '../../../core/services/sale.service';
import {
  TransactionFeedQuery,
  TransactionFeedService,
} from '../../../core/services/transaction-feed.service';
import { UserService } from '../../../core/services/user.service';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { SaleItemsDialog } from '../../../shared/dialogs/sale-items-dialog';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

type StatusFilter = SaleStatus | 'all' | 'VOIDED';
type SourceFilter = 'all' | 'SALE' | 'GCASH' | 'LOAD';

/** Per-kind display label + icon, derived client-side so the feed DTO
 *  stays presentation-free. */
const KIND_META: Readonly<Record<TransactionKind, { label: string; icon: string }>> = {
  SALE: { label: 'Sale', icon: 'point_of_sale' },
  GCASH_IN: { label: 'GCash cash-in', icon: 'smartphone' },
  GCASH_OUT: { label: 'GCash cash-out', icon: 'smartphone' },
  LOAD: { label: 'Load', icon: 'sim_card' },
};

/** A feed row enriched with its display label/icon for the template. */
interface DisplayRow extends TransactionRow {
  readonly typeLabel: string;
  readonly typeIcon: string;
}

@Component({
  selector: 'app-sales-page',
  imports: [
    DatePipe,
    TitleCasePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    MatMenuModule,
    MatTooltipModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sales.page.html',
  styleUrl: './sales.page.scss',
})
export class SalesPage {
  private readonly feed = inject(TransactionFeedService);
  private readonly saleService = inject(SaleService);
  private readonly userService = inject(UserService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly cashiers = this.userService.cashiers;

  protected readonly search = signal('');
  protected readonly status = signal<StatusFilter>('all');
  protected readonly source = signal<SourceFilter>('all');
  protected readonly cashier = signal<string>('all');

  /** Date-range filter (inclusive on both ends). Null = unbounded. */
  protected readonly fromDate = signal<Date | null>(null);
  protected readonly toDate = signal<Date | null>(null);

  /** Upper bound for the pickers — no future transactions exist. */
  protected readonly today = new Date();

  /** `from` as an ISO instant at the start of the picked local day. */
  private readonly fromIso = computed(() => {
    const d = this.fromDate();
    return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString() : undefined;
  });

  /** `to` as an ISO instant at the start of the day AFTER the picked
   *  local day — an exclusive upper bound so the whole 'to' day is kept. */
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
  private readonly _error = signal<string | null>(null);
  protected readonly loading = this.fetching.asReadonly();
  protected readonly error = this._error.asReadonly();

  /** Bumped to force a re-fetch of the current page (refund / retry)
   *  without changing any filter. */
  private readonly reloadTick = signal(0);

  private readonly emptyPage: Page<TransactionRow> = {
    content: [],
    page: 0,
    size: 10,
    totalElements: 0,
    totalPages: 0,
  };

  /** All inputs that should trigger a fetch, collapsed into one value. */
  private readonly queryParams = computed<TransactionFeedQuery & { tick: number }>(() => ({
    search: this.search().trim(),
    status: this.status(),
    source: this.source(),
    cashierId: this.cashier(),
    from: this.fromIso(),
    to: this.toIso(),
    page: this.pageIndex(),
    size: this.pageSize(),
    tick: this.reloadTick(),
  }));

  /**
   * The current page, fetched server-side. Debounced so typing in the
   * search box (or a fast burst of filter changes) collapses into a
   * single request; `switchMap` cancels any in-flight request when a
   * newer one supersedes it. Errors fall back to an empty page and
   * surface via {@link error}.
   */
  private readonly pageData = toSignal(
    toObservable(this.queryParams).pipe(
      debounceTime(200),
      switchMap((q) => {
        this.fetching.set(true);
        this._error.set(null);
        return this.feed.query(q).pipe(
          catchError((err: HttpErrorResponse) => {
            this._error.set(this.describe(err));
            return of(this.emptyPage);
          }),
        );
      }),
      tap(() => this.fetching.set(false)),
    ),
    { initialValue: this.emptyPage },
  );

  protected readonly rows = computed<DisplayRow[]>(() =>
    this.pageData().content.map((r) => ({
      ...r,
      typeLabel: KIND_META[r.kind].label,
      typeIcon: KIND_META[r.kind].icon,
    })),
  );

  protected readonly total = computed(() => this.pageData().totalElements);

  protected readonly columns = [
    'id',
    'date',
    'cashier',
    'items',
    'payment',
    'total',
    'status',
    'actions',
  ] as const;

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

  protected setStatus(value: StatusFilter): void {
    this.status.set(value);
    this.pageIndex.set(0);
  }

  protected setSource(value: SourceFilter): void {
    this.source.set(value);
    this.pageIndex.set(0);
  }

  protected setCashier(value: string): void {
    this.cashier.set(value);
    this.pageIndex.set(0);
  }

  protected setFromDate(value: Date | null): void {
    this.fromDate.set(value);
    // Prefill "To" with the same date when it hasn't been set yet, so a
    // single-day range is one tap; leave an existing "To" untouched.
    if (value && this.toDate() === null) {
      this.toDate.set(value);
    }
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

  protected retry(): void {
    this.reload();
  }

  private reload(): void {
    this.reloadTick.update((t) => t + 1);
  }

  protected viewItems(row: DisplayRow): void {
    if (row.kind !== 'SALE') return;
    // The feed row is lightweight (no line items); fetch the full sale
    // on demand so the items dialog has what it needs.
    this.saleService.get(row.id).subscribe({
      next: (sale) =>
        this.dialog.open(SaleItemsDialog, {
          width: '560px',
          maxWidth: '95vw',
          panelClass: ['sale-items-panel', 'dialog-fullscreen-mobile'],
          autoFocus: false,
          data: sale,
        }),
      error: (err: HttpErrorResponse) =>
        this.snackBar.open(err.error?.message ?? 'Could not load sale items.', 'Dismiss', {
          duration: 3000,
        }),
    });
  }

  protected confirmRefund(row: DisplayRow): void {
    if (row.kind !== 'SALE') return;
    if (row.status === 'REFUNDED') {
      this.snackBar.open('Already refunded.', 'Dismiss', { duration: 2500 });
      return;
    }
    const itemCount = row.itemsCount ?? 0;
    const ref = this.dialog.open(ConfirmDialog, {
      width: '460px',
      data: {
        title: 'Refund sale',
        message: `Refund sale ${row.reference} (${itemCount} items)? Stock returns to inventory as a new batch.`,
        confirmLabel: 'Refund',
        destructive: true,
        icon: 'undo',
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.saleService.refund(row.id).subscribe({
        next: () => {
          this.snackBar.open(`Refunded ${row.reference}`, 'Dismiss', { duration: 2500 });
          this.reload();
        },
        error: (err: HttpErrorResponse) => {
          this.snackBar.open(err.error?.message ?? 'Refund failed.', 'Dismiss', { duration: 4000 });
        },
      });
    });
  }

  /** Service-feature rows (GCash / Load) can only be voided from their
   *  own admin tabs, so the row menu only offers actions for sales. */
  protected isServiceRow(row: DisplayRow): boolean {
    return row.kind !== 'SALE';
  }

  private describe(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Cannot reach the server.';
    if (err.status === 403) return 'Admin access required.';
    return err.error?.message ?? `Request failed (${err.status})`;
  }
}
