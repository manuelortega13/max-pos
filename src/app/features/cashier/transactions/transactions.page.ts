import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
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
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { CreditorPayment, Sale, SaleStatus } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { CreditorPaymentService } from '../../../core/services/creditor-payment.service';
import { GcashService } from '../../../core/services/gcash.service';
import { LoadService } from '../../../core/services/load.service';
import { SaleService } from '../../../core/services/sale.service';
import { SettingsService } from '../../../core/services/settings.service';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';
import { SaleItemsDialog } from '../../../shared/dialogs/sale-items-dialog';
import { RefundDialog, RefundDialogData, RefundDialogResult } from './refund-dialog';

type StatusFilter = SaleStatus | 'all';

@Component({
  selector: 'app-transactions-page',
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
    MatMenuModule,
    MatTableModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transactions.page.html',
  styleUrl: './transactions.page.scss',
})
export class TransactionsPage implements OnInit {
  private readonly saleService = inject(SaleService);
  private readonly paymentService = inject(CreditorPaymentService);
  private readonly gcashService = inject(GcashService);
  private readonly loadService = inject(LoadService);
  private readonly authService = inject(AuthService);
  private readonly settingsService = inject(SettingsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /** Credit payments the cashier recorded today. Fetched on init —
   *  payment volume per cashier per day is small (handful of rows),
   *  no pagination needed. */
  protected readonly todayPayments = signal<CreditorPayment[]>([]);

  /**
   * GCash transactions the cashier recorded today. Read from the service's
   * cached signal (refreshed on init) rather than a one-shot fetch so rows
   * rung up offline — which live only in the local queue/cache until they
   * sync — still appear here, and the list updates live when they sync.
   */
  protected readonly todayGcash = computed(() =>
    this.gcashService.transactions().filter((t) => this.inToday(t.date)),
  );

  /** Load transactions the cashier recorded today. Same offline-aware source. */
  protected readonly todayLoad = computed(() =>
    this.loadService.transactions().filter((t) => this.inToday(t.date)),
  );

  /** True for an ISO timestamp falling within the cashier's local calendar
   *  day. Used to scope the GCash/Load tables to "today". */
  private inToday(iso: string): boolean {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const t = Date.parse(iso);
    return t >= startOfDay && t < startOfDay + 86_400_000;
  }

  protected readonly paymentColumns = [
    'ref',
    'date',
    'creditor',
    'method',
    'amount',
    'status',
  ] as const;

  protected readonly gcashColumns = [
    'ref',
    'date',
    'type',
    'amount',
    'fee',
    'status',
  ] as const;

  protected readonly loadColumns = [
    'ref',
    'date',
    'phone',
    'promo',
    'amount',
    'fee',
    'status',
  ] as const;

  ngOnInit(): void {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + 86_400_000;
    const inToday = (iso: string) => {
      const t = Date.parse(iso);
      return t >= startOfDay && t < endOfDay;
    };

    this.paymentService.listMine().subscribe({
      next: (list) => this.todayPayments.set(list.filter((p) => inToday(p.date))),
      // Quiet failure — payments are additive context; sales remain
      // the primary view of "my day". A snackbar would feel like a
      // hard error for a soft feature.
      error: () => {},
    });

    // Refresh the cached GCash/Load lists (the `today*` computeds read them).
    // A network failure here is fine — the cache keeps whatever it had,
    // including any offline-queued rows, so the tables still render.
    this.gcashService.load();
    this.loadService.load();
  }

  protected readonly currentUser = this.authService.user;
  protected readonly currencySymbol = computed(
    () => this.settingsService.settings().currencySymbol,
  );

  protected readonly search = signal<string>('');
  protected readonly status = signal<StatusFilter>('all');
  protected readonly selectedProductIds = signal<ReadonlySet<string>>(new Set());
  protected readonly fromHour = signal<number | null>(null);
  protected readonly fromMinute = signal<number | null>(null);
  protected readonly toHour = signal<number | null>(null);
  protected readonly toMinute = signal<number | null>(null);
  protected readonly totalMin = signal<number | null>(null);
  protected readonly totalMax = signal<number | null>(null);

  /** Upper bound for the date picker — sales can't be rung up in the future. */
  protected readonly today = new Date();

  /** The calendar day whose sales the table shows. Defaults to today;
   *  the date picker lets the cashier look back at earlier days. */
  protected readonly selectedDate = signal<Date>(new Date());

  /** True while the picked date is the cashier's current calendar day. */
  protected readonly isToday = computed(() => {
    const d = this.selectedDate();
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  });

  /**
   * Sales rung up by this cashier on the {@link selectedDate} (cashier's
   * local calendar day). Independent of the business-day open/close state —
   * once a sale is on the books the cashier can review it here, even after
   * the admin has closed the day.
   */
  private readonly mySales = computed(() => {
    const user = this.currentUser();
    if (!user) return [];
    const d = this.selectedDate();
    const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const endOfDay = startOfDay + 86_400_000;
    return this.saleService.byCashier(user.id).filter((s) => {
      const t = Date.parse(s.date);
      return t >= startOfDay && t < endOfDay;
    });
  });

  /** Free-text filter for the product menu's checklist. */
  protected readonly productSearch = signal<string>('');

  /** Distinct products sold across the day's sales, for the product filter
   *  menu. Keyed by id; label is the name captured at sale time. */
  protected readonly productOptions = computed(() => {
    const byId = new Map<string, string>();
    for (const sale of this.mySales()) {
      for (const item of sale.items) {
        if (!byId.has(item.productId)) byId.set(item.productId, item.productName);
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** {@link productOptions} narrowed by the menu's search box. */
  protected readonly visibleProductOptions = computed(() => {
    const term = this.productSearch().trim().toLowerCase();
    if (!term) return this.productOptions();
    return this.productOptions().filter((p) => p.name.toLowerCase().includes(term));
  });

  protected readonly filteredSales = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.status();
    const products = this.selectedProductIds();
    const fromH = this.fromHour();
    const toH = this.toHour();
    const fromMin = fromH !== null ? fromH * 60 + (this.fromMinute() ?? 0) : null;
    const toMin = toH !== null ? toH * 60 + (this.toMinute() ?? 0) : null;
    const min = this.totalMin();
    const max = this.totalMax();

    return this.mySales().filter((s) => {
      if (status !== 'all' && s.status !== status) return false;
      if (term && !s.reference.toLowerCase().includes(term)) return false;
      if (products.size && !s.items.some((i) => products.has(i.productId))) return false;

      if (fromMin !== null || toMin !== null) {
        const sale = new Date(s.date);
        const saleMin = sale.getHours() * 60 + sale.getMinutes();
        if (fromMin !== null && saleMin < fromMin) return false;
        if (toMin !== null && saleMin > toMin) return false;
      }

      if (min != null && s.total < min) return false;
      if (max != null && s.total > max) return false;

      return true;
    });
  });

  protected readonly totals = computed(() => {
    const sales = this.filteredSales().filter((s) => s.status === 'COMPLETED');
    return {
      transactions: sales.length,
      revenue: sales.reduce((sum, s) => sum + s.total, 0),
      items: sales.reduce((sum, s) => sum + s.items.reduce((n, i) => n + i.quantity, 0), 0),
    };
  });

  protected readonly hasProductFilter = computed(() => this.selectedProductIds().size > 0);

  protected readonly productLabel = computed(() => {
    const ids = this.selectedProductIds();
    if (ids.size === 0) return '';
    if (ids.size === 1) {
      const only = this.productOptions().find((p) => ids.has(p.id));
      return only?.name ?? '1 product';
    }
    return `${ids.size} products`;
  });

  protected readonly hasTimeFilter = computed(
    () => this.fromHour() !== null || this.toHour() !== null,
  );

  protected readonly hasTotalFilter = computed(
    () => this.totalMin() !== null || this.totalMax() !== null,
  );

  protected readonly hasActiveFilters = computed(
    () =>
      this.search() !== '' ||
      this.status() !== 'all' ||
      this.hasProductFilter() ||
      !this.isToday() ||
      this.hasTimeFilter() ||
      this.hasTotalFilter(),
  );

  protected readonly timeLabel = computed(() => {
    const fh = this.fromHour();
    const th = this.toHour();
    const fmt = (h: number | null, m: number | null) =>
      h === null ? '' : `${this.pad2(h)}:${this.pad2(m ?? 0)}`;
    const from = fmt(fh, this.fromMinute());
    const to = fmt(th, this.toMinute());
    if (from && to) return `${from} – ${to}`;
    if (from) return `from ${from}`;
    if (to) return `until ${to}`;
    return '';
  });

  protected readonly totalLabel = computed(() => {
    const min = this.totalMin();
    const max = this.totalMax();
    const sym = this.currencySymbol();
    if (min != null && max != null) return `${sym}${min} – ${sym}${max}`;
    if (min != null) return `min ${sym}${min}`;
    if (max != null) return `max ${sym}${max}`;
    return '';
  });

  protected readonly columns = ['id', 'date', 'items', 'payment', 'total', 'status', 'actions'] as const;

  protected pad2(n: number): string {
    return n.toString().padStart(2, '0');
  }

  protected setStatus(s: StatusFilter): void {
    this.status.set(s);
  }

  protected clearStatus(ev?: Event): void {
    ev?.stopPropagation();
    this.status.set('all');
  }

  protected isProductSelected(id: string): boolean {
    return this.selectedProductIds().has(id);
  }

  protected toggleProduct(id: string): void {
    const next = new Set(this.selectedProductIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selectedProductIds.set(next);
  }

  protected clearProducts(ev?: Event): void {
    ev?.stopPropagation();
    this.selectedProductIds.set(new Set());
    this.productSearch.set('');
  }

  protected resetDate(): void {
    this.selectedDate.set(new Date());
  }

  protected clearTime(ev?: Event): void {
    ev?.stopPropagation();
    this.fromHour.set(null);
    this.fromMinute.set(null);
    this.toHour.set(null);
    this.toMinute.set(null);
  }

  protected clearTotal(ev?: Event): void {
    ev?.stopPropagation();
    this.totalMin.set(null);
    this.totalMax.set(null);
  }

  protected clearSearch(ev?: Event): void {
    ev?.stopPropagation();
    this.search.set('');
  }

  /** A different day has its own set of products sold, so drop any product
   *  selection that belonged to the previous day to avoid a stale, no-match
   *  filter. */
  protected onDateChange(date: Date | null): void {
    this.selectedDate.set(date ?? new Date());
    this.clearProducts();
  }

  protected clearFilters(): void {
    this.search.set('');
    this.status.set('all');
    this.clearProducts();
    this.resetDate();
    this.clearTime();
    this.clearTotal();
  }

  protected viewItems(sale: Sale): void {
    this.dialog.open(SaleItemsDialog, {
      width: '560px',
      maxWidth: '95vw',
      panelClass: ['sale-items-panel', 'dialog-fullscreen-mobile'],
      autoFocus: false,
      data: sale,
    });
  }

  protected confirmRefund(sale: Sale): void {
    if (sale.status === 'REFUNDED') {
      this.snackBar.open('Already refunded.', 'Dismiss', { duration: 2500 });
      return;
    }
    const data: RefundDialogData = {
      reference: sale.reference,
      itemCount: sale.items.length,
      totalLabel: `${this.currencySymbol()}${sale.total.toFixed(2)}`,
    };
    const ref = this.dialog.open<RefundDialog, RefundDialogData, RefundDialogResult>(
      RefundDialog,
      { width: '480px', panelClass: 'dialog-fullscreen-mobile', data },
    );
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.saleService.refund(sale.id, result.reason).subscribe({
        next: () =>
          this.snackBar.open(`Refunded ${sale.reference}`, 'Dismiss', { duration: 2500 }),
        error: (err: HttpErrorResponse) => {
          this.snackBar.open(err.error?.message ?? 'Refund failed.', 'Dismiss', { duration: 4000 });
        },
      });
    });
  }
}
