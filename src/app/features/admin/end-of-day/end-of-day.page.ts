import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { BusinessDay } from '../../../core/models';
import { BusinessDayService } from '../../../core/services/business-day.service';
import { PrinterService } from '../../../core/services/printer.service';
import { SaleService } from '../../../core/services/sale.service';
import { SettingsService } from '../../../core/services/settings.service';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';
import { CloseDayDialog, CloseDayDialogData, CloseDayDialogResult } from './close-day-dialog';
import { OpenDayDialog, OpenDayDialogResult } from './open-day-dialog';

@Component({
  selector: 'app-end-of-day-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './end-of-day.page.html',
  styleUrl: './end-of-day.page.scss',
})
export class EndOfDayPage implements OnInit {
  private readonly businessDayService = inject(BusinessDayService);
  private readonly saleService = inject(SaleService);
  private readonly settingsService = inject(SettingsService);
  private readonly printer = inject(PrinterService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly currentDay = this.businessDayService.current;
  protected readonly history = this.businessDayService.history;
  protected readonly loading = this.businessDayService.loading;
  protected readonly storeName = computed(() => this.settingsService.settings().storeName);
  protected readonly storeAddress = computed(() => this.settingsService.settings().address);
  protected readonly storePhone = computed(() => this.settingsService.settings().phone);
  protected readonly receiptFooter = computed(() => this.settingsService.settings().receiptFooter);
  protected readonly currencySymbol = computed(
    () => this.settingsService.settings().currencySymbol,
  );

  /**
   * Live preview of the totals that will land on the snapshot when the
   * day is closed. Computed from the admin's `sales` list filtered to
   * the open day's window. Backend recomputes canonical values on close;
   * any tiny drift from a late sale lands on the printed Z-report.
   */
  protected readonly preview = computed(() => {
    const day = this.currentDay();
    const empty = {
      cashSales: 0,
      cashRefunds: 0,
      cardSales: 0,
      transferSales: 0,
      totalSales: 0,
      totalRefunds: 0,
      salesCount: 0,
      itemsSold: 0,
    };
    if (!day) return empty;
    const openedAt = Date.parse(day.openedAt);
    let cashSales = 0,
      cashRefunds = 0,
      cardSales = 0,
      transferSales = 0,
      totalSales = 0,
      totalRefunds = 0,
      salesCount = 0,
      itemsSold = 0;
    // Gross accounting — must mirror BusinessDayService.close on the
    // backend. Every sale counts toward the sales totals; refunds are
    // a separate offsetting line. Skipping refunded sales from
    // cashSales would produce a negative expectedCash whenever
    // same-day refunds exceeded same-day completed cash sales (e.g.
    // 3 cash sales, 2 of which got refunded later in the day).
    for (const s of this.saleService.sales()) {
      if (Date.parse(s.date) < openedAt) continue;
      const refunded = s.status === 'REFUNDED';
      totalSales += s.total;
      salesCount++;
      itemsSold += s.items.reduce((n, i) => n + i.quantity, 0);
      switch (s.paymentMethod) {
        case 'CASH':
          cashSales += s.total;
          break;
        case 'CARD':
          cardSales += s.total;
          break;
        case 'TRANSFER':
          transferSales += s.total;
          break;
      }
      if (refunded) {
        totalRefunds += s.total;
        // Only cash refunds affect the drawer; card/transfer refunds
        // flow back through the customer's bank, not the till.
        if (s.paymentMethod === 'CASH') cashRefunds += s.total;
      }
    }
    return { cashSales, cashRefunds, cardSales, transferSales, totalSales, totalRefunds, salesCount, itemsSold };
  });

  protected readonly expectedCash = computed(() => {
    const day = this.currentDay();
    if (!day) return 0;
    const p = this.preview();
    return day.openingFloat + p.cashSales - p.cashRefunds;
  });

  protected readonly historyColumns = ['opened', 'closed', 'total', 'variance', 'closedBy'] as const;

  ngOnInit(): void {
    // refreshCurrent runs in admin-layout init; do it here too so a
    // direct deep-link to this page (refresh) still has fresh state.
    this.businessDayService.refreshCurrent().subscribe();
    this.businessDayService.loadHistory();
    // Pull the admin sales list so the live preview has data to aggregate.
    this.saleService.load();
  }

  protected openDay(): void {
    const ref = this.dialog.open<OpenDayDialog, void, OpenDayDialogResult>(OpenDayDialog, {
      width: '420px',
      panelClass: 'dialog-fullscreen-mobile',
      autoFocus: false,
    });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.businessDayService.open({ openingFloat: result.openingFloat }).subscribe({
        next: () =>
          this.snackBar.open('Business day opened.', 'Dismiss', { duration: 2500 }),
        error: (err: HttpErrorResponse) => {
          this.snackBar.open(err.error?.message ?? 'Could not open day.', 'Dismiss', {
            duration: 4000,
          });
        },
      });
    });
  }

  protected closeDay(): void {
    const day = this.currentDay();
    if (!day) return;
    const p = this.preview();
    const data: CloseDayDialogData = {
      openingFloat: day.openingFloat,
      openedAtLabel: this.formatOpenedAt(day.openedAt),
      ...p,
    };
    const ref = this.dialog.open<CloseDayDialog, CloseDayDialogData, CloseDayDialogResult>(
      CloseDayDialog,
      {
        width: '560px',
        panelClass: 'dialog-fullscreen-mobile',
        autoFocus: false,
        data,
      },
    );
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.businessDayService
        .close({ countedCash: result.countedCash, notes: result.notes })
        .subscribe({
          next: (closed) => {
            this.snackBar.open('Business day closed.', 'Dismiss', { duration: 2500 });
            void this.printer.printZReport({
              storeName: this.storeName(),
              address: this.storeAddress(),
              phone: this.storePhone(),
              footer: this.receiptFooter(),
              currencySymbol: this.currencySymbol(),
              day: closed,
            });
          },
          error: (err: HttpErrorResponse) => {
            this.snackBar.open(err.error?.message ?? 'Could not close day.', 'Dismiss', {
              duration: 4000,
            });
          },
        });
    });
  }

  protected reprint(day: BusinessDay): void {
    void this.printer.printZReport({
      storeName: this.storeName(),
      address: this.storeAddress(),
      phone: this.storePhone(),
      footer: this.receiptFooter(),
      currencySymbol: this.currencySymbol(),
      day,
    });
  }

  private formatOpenedAt(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString();
  }
}
