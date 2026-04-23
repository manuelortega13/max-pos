import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe, TitleCasePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { ExpiringBatch } from '../../../core/models';
import { NotificationService } from '../../../core/services/notification.service';
import { ProductService } from '../../../core/services/product.service';
import { SaleService } from '../../../core/services/sale.service';
import { UserService } from '../../../core/services/user.service';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

@Component({
  selector: 'app-dashboard-page',
  imports: [
    DatePipe,
    DecimalPipe,
    TitleCasePipe,
    RouterLink,
    MatCardModule,
    MatIconModule,
    MatTableModule,
    MatChipsModule,
    MatButtonModule,
    MatDividerModule,
    MatTooltipModule,
    MoneyPipe,
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
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly todayRevenue = this.saleService.todayRevenue;
  protected readonly todayTransactions = this.saleService.todayTransactionCount;
  protected readonly averageTicket = this.saleService.averageTicket;
  protected readonly activeCashiers = computed(() => this.userService.activeCashiers().length);
  protected readonly lowStock = this.productService.lowStockProducts;
  protected readonly outOfStock = this.productService.outOfStockProducts;
  protected readonly recentSales = computed(() => this.saleService.sales().slice(0, 5));

  /** Batches that have already passed their expiry — surfaced with write-off actions. */
  protected readonly expiredBatches = computed(() =>
    this.notifications.expiring().filter((b) => b.daysUntilExpiry < 0),
  );
  /** Batches that haven't expired yet but will within 30 days. */
  protected readonly upcomingExpiring = computed(() =>
    this.notifications.expiring().filter((b) => b.daysUntilExpiry >= 0),
  );

  protected readonly saleColumns = ['id', 'date', 'cashier', 'items', 'total', 'status'] as const;

  constructor() {
    // Ensure the notification poller is running even if the user landed here
    // without bouncing through the shell (e.g. direct URL after login).
    this.notifications.start();
  }

  protected confirmWriteOff(batch: ExpiringBatch): void {
    const daysAgo = -batch.daysUntilExpiry;
    const ageLabel =
      daysAgo === 0 ? 'today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`;
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
          this.snackBar.open(
            err.error?.message ?? 'Write-off failed.',
            'Dismiss',
            { duration: 4000 },
          );
        },
      });
    });
  }
}
