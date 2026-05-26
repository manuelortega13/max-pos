import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { BusinessDay, CreditorPayment, GcashTransaction } from '../../../core/models';
import { BusinessDayService } from '../../../core/services/business-day.service';
import { CreditorPaymentService } from '../../../core/services/creditor-payment.service';
import { GcashService } from '../../../core/services/gcash.service';
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
  private readonly paymentService = inject(CreditorPaymentService);
  private readonly gcashService = inject(GcashService);
  private readonly settingsService = inject(SettingsService);
  private readonly printer = inject(PrinterService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /**
   * Credit payments loaded for the live preview. Filtered against
   * the current open day's businessDayId so we don't accidentally
   * count yesterday's payments when an open day rolls over.
   */
  protected readonly allPayments = signal<CreditorPayment[]>([]);
  /** GCash transactions loaded for the live preview. Same scoping
   *  rule as credit payments — filter against the current day's id. */
  protected readonly allGcash = signal<GcashTransaction[]>([]);

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
      creditSales: 0,
      /** Cash credit payments collected today — added to expected cash. */
      cashCreditPayments: 0,
      /** Total credit payments (cash + card + transfer) — shown on
       *  the report. Card/transfer payments don't enter the till. */
      totalCreditPayments: 0,
      gcashCashInAmount: 0,
      gcashCashInFees: 0,
      gcashCashOutAmount: 0,
      gcashCashOutFees: 0,
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
      creditSales = 0,
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
        case 'CREDIT':
          creditSales += s.total;
          break;
      }
      if (refunded) {
        totalRefunds += s.total;
        // Only cash refunds affect the drawer; card/transfer refunds
        // flow back through the customer's bank, not the till.
        if (s.paymentMethod === 'CASH') cashRefunds += s.total;
      }
    }

    // Walk this day's credit payments. Voided payments are excluded
    // from totals — they don't affect the drawer or the daily take.
    let cashCreditPayments = 0;
    let totalCreditPayments = 0;
    for (const p of this.allPayments()) {
      if (p.voidedAt !== null) continue;
      if (p.businessDayId !== day.id) continue;
      totalCreditPayments += p.amount;
      if (p.paymentMethod === 'CASH') cashCreditPayments += p.amount;
    }

    // GCash bucket totals. Voided rows excluded so the preview matches
    // BusinessDayService.close. Cash-in adds (amount + fee) to the
    // drawer; cash-out removes amount but keeps fee.
    let gcashCashInAmount = 0,
      gcashCashInFees = 0,
      gcashCashOutAmount = 0,
      gcashCashOutFees = 0;
    for (const g of this.allGcash()) {
      if (g.voidedAt !== null) continue;
      if (g.businessDayId !== day.id) continue;
      if (g.type === 'CASH_IN') {
        gcashCashInAmount += g.amount;
        gcashCashInFees += g.fee;
      } else {
        gcashCashOutAmount += g.amount;
        gcashCashOutFees += g.fee;
      }
    }

    return {
      cashSales,
      cashRefunds,
      cardSales,
      transferSales,
      creditSales,
      cashCreditPayments,
      totalCreditPayments,
      gcashCashInAmount,
      gcashCashInFees,
      gcashCashOutAmount,
      gcashCashOutFees,
      totalSales,
      totalRefunds,
      salesCount,
      itemsSold,
    };
  });

  protected readonly expectedCash = computed(() => {
    const day = this.currentDay();
    if (!day) return 0;
    const p = this.preview();
    // float + cash in (sales + credit payments + GCash cash-ins + all
    // GCash fees) − cash out (refunds + GCash cash-outs).
    // Card / transfer credit payments don't touch the drawer.
    return (
      day.openingFloat +
      p.cashSales +
      p.cashCreditPayments +
      p.gcashCashInAmount +
      p.gcashCashInFees +
      p.gcashCashOutFees -
      p.cashRefunds -
      p.gcashCashOutAmount
    );
  });

  protected readonly historyColumns = ['opened', 'closed', 'total', 'variance', 'closedBy'] as const;

  ngOnInit(): void {
    // refreshCurrent runs in admin-layout init; do it here too so a
    // direct deep-link to this page (refresh) still has fresh state.
    this.businessDayService.refreshCurrent().subscribe();
    this.businessDayService.loadHistory();
    // Pull the admin sales list so the live preview has data to aggregate.
    this.saleService.load();
    // Same for credit payments — feeds into the cash-drawer math
    // and the "Credit payments" preview row.
    this.paymentService.listAll().subscribe({
      next: (list) => this.allPayments.set(list),
      error: () => {
        // Soft failure — preview just renders zeros. The close action
        // re-aggregates server-side so the actual snapshot still gets
        // the right numbers.
      },
    });
    this.gcashService.listAll().subscribe({
      next: (list) => this.allGcash.set(list),
      error: () => {},
    });
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
