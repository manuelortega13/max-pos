import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { ExpiringBatch } from '../../../core/models';
import { ExpenseService } from '../../../core/services/expense.service';
import { GcashService } from '../../../core/services/gcash.service';
import { LoadService } from '../../../core/services/load.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ProductService } from '../../../core/services/product.service';
import { SaleService } from '../../../core/services/sale.service';
import { SettingsService } from '../../../core/services/settings.service';
import { UserService } from '../../../core/services/user.service';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';
import { SalesGrowthChart } from './components/sales-growth-chart';
import { TopProducts } from './components/top-products';

@Component({
  selector: 'app-dashboard-page',
  imports: [
    DecimalPipe,
    RouterLink,
    MatCardModule,
    MatIconModule,
    MatChipsModule,
    MatButtonModule,
    MatDividerModule,
    MatTooltipModule,
    MoneyPipe,
    SalesGrowthChart,
    TopProducts,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  private readonly saleService = inject(SaleService);
  private readonly productService = inject(ProductService);
  private readonly userService = inject(UserService);
  private readonly notifications = inject(NotificationService);
  private readonly expenseService = inject(ExpenseService);
  private readonly gcashService = inject(GcashService);
  private readonly loadService = inject(LoadService);
  private readonly settingsService = inject(SettingsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly currencySymbol = computed(
    () => this.settingsService.settings().currencySymbol,
  );

  /** "Today" boundary used by every today-* computed below. */
  private readonly todayIso = computed(() => new Date().toISOString().slice(0, 10));

  /** Today's GCash service-fee revenue (completed, non-voided rows). */
  private readonly todayGcashFees = computed(() => {
    const today = this.todayIso();
    return this.gcashService
      .completedTransactions()
      .filter((t) => t.date.startsWith(today))
      .reduce((sum, t) => sum + Number(t.fee ?? 0), 0);
  });

  /** Today's cellphone-load service-fee revenue. */
  private readonly todayLoadFees = computed(() => {
    const today = this.todayIso();
    return this.loadService
      .completedTransactions()
      .filter((t) => t.date.startsWith(today))
      .reduce((sum, t) => sum + Number(t.fee ?? 0), 0);
  });

  /** Today's revenue = product sales + GCash fees + Load fees. */
  protected readonly todayRevenue = computed(
    () => this.saleService.todayRevenue() + this.todayGcashFees() + this.todayLoadFees(),
  );

  protected readonly todayTransactions = this.saleService.todayTransactionCount;
  protected readonly averageTicket = this.saleService.averageTicket;
  protected readonly activeCashiers = computed(() => this.userService.activeCashiers().length);
  protected readonly lowStock = this.productService.lowStockProducts;
  protected readonly outOfStock = this.productService.outOfStockProducts;

  /** How many low-stock items the dashboard card shows before collapsing
   *  the rest behind a "+N more" line — keeps the card compact when many
   *  products are low. The full list lives on the Inventory page. */
  private readonly LOW_STOCK_PREVIEW = 6;

  /** The most urgent low-stock items (lowest stock first), capped for the
   *  dashboard card. */
  protected readonly lowStockPreview = computed(() =>
    [...this.lowStock()].sort((a, b) => a.stock - b.stock).slice(0, this.LOW_STOCK_PREVIEW),
  );

  /** Count of low-stock items beyond the preview cap (0 when all fit). */
  protected readonly lowStockOverflow = computed(() =>
    Math.max(0, this.lowStock().length - this.LOW_STOCK_PREVIEW),
  );

  /** Batches that have already passed their expiry — surfaced with write-off actions. */
  protected readonly expiredBatches = computed(() =>
    this.notifications.expiring().filter((b) => b.daysUntilExpiry < 0),
  );
  /** Batches that haven't expired yet but will within 30 days. */
  protected readonly upcomingExpiring = computed(() =>
    this.notifications.expiring().filter((b) => b.daysUntilExpiry >= 0),
  );

  // ─── Profit insights (rolling 30-day window) ─────────────────────
  //
  // All math is derived from already-loaded signals — no new endpoint.
  // The window is rolling (today − 29 days through today inclusive,
  // 30 calendar days) so the figures stabilize regardless of where the
  // calendar month boundary falls. Fixed costs are averaged across the
  // window as expenses ÷ 30 — this assumes the admin records monthly
  // bills (rent, electric, etc.) regularly; if a month was skipped the
  // daily figure will under-report.

  private readonly WINDOW_DAYS = 30;

  private readonly windowStartMs = computed(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - (this.WINDOW_DAYS - 1));
    return start.getTime();
  });

  private readonly windowSales = computed(() => {
    const startMs = this.windowStartMs();
    return this.saleService.completedSales().filter((s) => Date.parse(s.date) >= startMs);
  });

  private readonly windowGcash = computed(() => {
    const startMs = this.windowStartMs();
    return this.gcashService.completedTransactions().filter((t) => Date.parse(t.date) >= startMs);
  });

  private readonly windowLoad = computed(() => {
    const startMs = this.windowStartMs();
    return this.loadService.completedTransactions().filter((t) => Date.parse(t.date) >= startMs);
  });

  /** 30-day service-fee revenue (GCash + Load). Fees are the store's
   *  cut on each transaction — the principal passes through to the
   *  wallet, so it isn't counted toward revenue. */
  private readonly windowServiceFees = computed(
    () =>
      this.windowGcash().reduce((s, t) => s + Number(t.fee ?? 0), 0) +
      this.windowLoad().reduce((s, t) => s + Number(t.fee ?? 0), 0),
  );

  private readonly windowExpenses = computed(() => {
    const startMs = this.windowStartMs();
    return this.expenseService.expenses().filter((e) => Date.parse(e.date) >= startMs);
  });

  protected readonly windowRevenue = computed(
    () => this.windowSales().reduce((sum, s) => sum + s.total, 0) + this.windowServiceFees(),
  );

  /** Pre-V14 sales have null unitCost — treated as zero cost. The UI
   *  hint flags this so a low-cost-coverage period isn't taken at
   *  face value. */
  protected readonly windowCogs = computed(() =>
    this.windowSales().reduce(
      (sum, s) => sum + s.items.reduce((n, i) => n + (i.unitCost ?? 0) * i.quantity, 0),
      0,
    ),
  );

  protected readonly windowExpenseTotal = computed(() =>
    this.windowExpenses().reduce((sum, e) => sum + Number(e.amount), 0),
  );

  protected readonly windowGrossProfit = computed(() => this.windowRevenue() - this.windowCogs());

  protected readonly windowNetProfit = computed(
    () => this.windowGrossProfit() - this.windowExpenseTotal(),
  );

  protected readonly effectiveMargin = computed(() => {
    const r = this.windowRevenue();
    return r > 0 ? this.windowGrossProfit() / r : 0;
  });

  protected readonly effectiveMarkup = computed(() => {
    const c = this.windowCogs();
    return c > 0 ? this.windowGrossProfit() / c : 0;
  });

  protected readonly avgDailyRevenue = computed(() => this.windowRevenue() / this.WINDOW_DAYS);

  protected readonly dailyFixedCost = computed(() => this.windowExpenseTotal() / this.WINDOW_DAYS);

  protected readonly netPerDay = computed(() => this.windowNetProfit() / this.WINDOW_DAYS);

  /** Daily revenue needed to cover fixed costs at the *current*
   *  margin. Returns null when margin is zero (can't break even at
   *  any volume) or expenses are zero (no fixed cost to cover). */
  protected readonly breakEvenDailyRevenue = computed<number | null>(() => {
    const margin = this.effectiveMargin();
    const fixed = this.dailyFixedCost();
    if (fixed <= 0) return 0;
    if (margin <= 0) return null;
    return fixed / margin;
  });

  protected readonly aboveBreakEven = computed(() => {
    const be = this.breakEvenDailyRevenue();
    return be !== null && this.avgDailyRevenue() >= be;
  });

  /** Whether the user has enough data for the insights to be meaningful.
   *  Requires both at least one sale and one expense in the window —
   *  otherwise the ratios are misleading. */
  protected readonly hasProfitData = computed(
    () => this.windowSales().length > 0 && this.windowExpenseTotal() > 0,
  );

  /** Single-line tailored guidance. Order matters: data-availability
   *  checks first, then below-break-even (most urgent), then thin
   *  markup, then the all-clear. */
  protected readonly profitRecommendation = computed(() => {
    if (!this.hasProfitData()) {
      return 'Record sales and add expenses for at least a week to see your profit picture.';
    }
    if (this.windowCogs() === 0) {
      return 'No product costs recorded yet — set product cost so margin and markup can be computed.';
    }
    const be = this.breakEvenDailyRevenue();
    if (be === null) {
      return 'Margin is zero or negative — you are selling at or below cost. Raise markup before doing anything else.';
    }
    if (!this.aboveBreakEven()) {
      const target = Math.ceil(be);
      return `Below break-even. Reach ${this.currencySymbol()}${target.toLocaleString()}/day in sales, or raise blended markup toward 60–75%.`;
    }
    if (this.effectiveMarkup() < 0.5) {
      return 'Above break-even but markup is thin — a 60–75% blend gives a safer cushion on slow days.';
    }
    return 'Healthy — sales are comfortably above break-even at the current markup.';
  });

  constructor() {
    // Ensure the notification poller is running even if the user landed here
    // without bouncing through the shell (e.g. direct URL after login).
    this.notifications.start();
    // Load expenses scoped to the insights window — admin landing on
    // the dashboard cold should see the profit panel populated.
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    start.setDate(start.getDate() - (this.WINDOW_DAYS - 1));
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    this.expenseService.load(iso(start), iso(today));
  }

  protected confirmWriteOff(batch: ExpiringBatch): void {
    const daysAgo = -batch.daysUntilExpiry;
    const ageLabel = daysAgo === 0 ? 'today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`;
    const ref = this.dialog.open(ConfirmDialog, {
      width: '460px',
      data: {
        title: 'Write off batch',
        message:
          `Write off ${batch.quantityRemaining} unit(s) of "${batch.productName}" ` +
          `(expired ${ageLabel})? This permanently removes the batch from salable inventory.`,
        confirmLabel: 'Write off',
        destructive: true,
        icon: 'delete_sweep',
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.productService.writeOffBatch(batch.batchId).subscribe({
        next: () => {
          // NotificationService refreshes automatically on the backend's
          // inventory.changed SSE, but refresh explicitly so the row vanishes
          // without waiting for the round-trip.
          this.notifications.refresh();
          this.snackBar.open(`Wrote off "${batch.productName}"`, 'Dismiss', { duration: 2500 });
        },
        error: (err: HttpErrorResponse) => {
          this.snackBar.open(err.error?.message ?? 'Write-off failed.', 'Dismiss', {
            duration: 4000,
          });
        },
      });
    });
  }
}
