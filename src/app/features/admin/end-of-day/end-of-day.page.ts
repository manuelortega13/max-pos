import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BusinessDay, ClosePreview, DayPreviewTotals, FloatAddition } from '../../../core/models';
import { AddToFloatDialog, AddToFloatDialogData } from './add-to-float-dialog';
import {
  HistoryDetailsDialog,
  HistoryDetailsDialogData,
  HistoryDetailsDialogResult,
} from './history-details-dialog';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { BusinessDayService } from '../../../core/services/business-day.service';
import { PrinterService } from '../../../core/services/printer.service';
import { SettingsService } from '../../../core/services/settings.service';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';
import { CloseDayDialog, CloseDayDialogData, CloseDayDialogResult } from './close-day-dialog';
import { OpenDayDialog, OpenDayDialogResult } from './open-day-dialog';

/** Zeroed totals shown before the preview lands (or when no day is open). */
const EMPTY_TOTALS: DayPreviewTotals = {
  cashSales: 0,
  cashRefunds: 0,
  cardSales: 0,
  transferSales: 0,
  gcashSales: 0,
  mayaSales: 0,
  bankSales: 0,
  creditSales: 0,
  cashCreditPayments: 0,
  totalCreditPayments: 0,
  gcashCashInAmount: 0,
  gcashCashInFees: 0,
  gcashCashOutAmount: 0,
  gcashCashOutFees: 0,
  loadAmount: 0,
  loadFees: 0,
  floatAdditions: 0,
  totalSales: 0,
  totalRefunds: 0,
  salesCount: 0,
  itemsSold: 0,
};

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
    MatTooltipModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './end-of-day.page.html',
  styleUrl: './end-of-day.page.scss',
})
export class EndOfDayPage implements OnInit {
  private readonly businessDayService = inject(BusinessDayService);
  private readonly settingsService = inject(SettingsService);
  private readonly printer = inject(PrinterService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /** Mid-day float top-ups for the currently-open day. Newest first
   *  so the EoD log reads chronologically downward. Kept as a separate
   *  scoped fetch — it drives the void-able float log and the AddToFloat
   *  dialog's "Float so far" pill. */
  protected readonly floatAdditions = signal<FloatAddition[]>([]);

  /** Total of active (non-voided) float additions. Feeds the AddToFloat
   *  dialog's "Float so far" pill. (The preview's own float total comes
   *  from the server and drives the cash math.) */
  protected readonly activeFloatAdditionsTotal = computed(() =>
    this.floatAdditions()
      .filter((a) => a.voidedAt === null)
      .reduce((sum, a) => sum + a.amount, 0),
  );

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
   * Live Close Day data, fetched server-side. The backend aggregates the
   * open day's sales / GCash / load / credit payments / float in one
   * query (see /api/business-days/current/preview), so the page no longer
   * downloads the full history to total it in the browser. Null until the
   * first fetch resolves or when no day is open.
   */
  private readonly previewResp = signal<ClosePreview | null>(null);

  /** Aggregated totals for the open day (zeros before the preview lands). */
  protected readonly preview = computed<DayPreviewTotals>(
    () => this.previewResp()?.totals ?? EMPTY_TOTALS,
  );

  /** Expected cash in the drawer, computed server-side alongside the totals. */
  protected readonly expectedCash = computed(() => this.previewResp()?.expectedCash ?? 0);

  protected readonly historyColumns = [
    'opened',
    'closed',
    'total',
    'variance',
    'closedBy',
  ] as const;

  ngOnInit(): void {
    // refreshCurrent runs in admin-layout init; do it here too so a
    // direct deep-link to this page (refresh) still has fresh state.
    this.businessDayService.refreshCurrent().subscribe();
    this.businessDayService.loadHistory();
    this.loadPreview();
    this.loadFloatAdditions();
  }

  /** Pull the server-computed Close Day preview for the open day. Soft
   *  failure — the live grid just shows zeros; the close re-aggregates
   *  server-side so the snapshot is still correct. */
  private loadPreview(): void {
    this.businessDayService.previewCurrent().subscribe({
      next: (preview) => this.previewResp.set(preview),
      error: () => this.previewResp.set(null),
    });
  }

  private loadFloatAdditions(): void {
    this.businessDayService.listFloatAdditions().subscribe({
      next: (list) => this.floatAdditions.set(list),
      // Soft failure — preview falls back to 0 additions and the
      // backend snapshot will still be correct at close time.
      error: () => {},
    });
  }

  protected openAddToFloat(): void {
    const day = this.currentDay();
    if (!day) return;
    const ref = this.dialog.open<AddToFloatDialog, AddToFloatDialogData, boolean>(
      AddToFloatDialog,
      {
        width: '440px',
        panelClass: 'dialog-fullscreen-mobile',
        autoFocus: 'first-tabbable',
        data: {
          openingFloat: day.openingFloat,
          priorAdditions: this.activeFloatAdditionsTotal(),
        },
      },
    );
    ref.afterClosed().subscribe((added) => {
      if (added) {
        this.loadFloatAdditions();
        this.loadPreview();
      }
    });
  }

  protected confirmVoidFloatAddition(addition: FloatAddition): void {
    if (
      !confirm(
        `Void this addition of ${this.currencySymbol()}${addition.amount.toFixed(2)}?\n\n` +
          `The cash physically added to the till stays put — voiding only removes ` +
          `the row from the end-of-day reconciliation. Use this for mistakes ` +
          `(wrong amount, duplicate entry).`,
      )
    )
      return;
    this.businessDayService.voidFloatAddition(addition.id).subscribe({
      next: () => {
        this.snackBar.open('Float addition voided', 'Dismiss', { duration: 2500 });
        this.loadFloatAdditions();
        this.loadPreview();
      },
      error: (err: HttpErrorResponse) => {
        this.snackBar.open(err.error?.message ?? 'Void failed.', 'Dismiss', { duration: 4000 });
      },
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
        next: () => {
          this.snackBar.open('Business day opened.', 'Dismiss', { duration: 2500 });
          this.loadPreview();
          this.loadFloatAdditions();
        },
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
            // Day is closed now — clear the live preview and refresh the
            // history table with the freshly-frozen snapshot row.
            this.previewResp.set(null);
            this.businessDayService.loadHistory();
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

  /** Id of the latest-closed day, or null when no closed days exist.
   *  Only this id is reopenable — older days are immutable history. */
  protected readonly latestClosedId = computed<string | null>(() => {
    const closed = this.history().filter((d) => d.closedAt !== null);
    if (closed.length === 0) return null;
    // history is ordered openedAt DESC — sort by closedAt instead so
    // a same-day reopen-then-close doesn't fool us.
    let latest = closed[0];
    for (const d of closed) {
      if (!latest.closedAt || (d.closedAt && d.closedAt > latest.closedAt)) {
        latest = d;
      }
    }
    return latest.id;
  });

  /**
   * Open the read-only Z-report-style details dialog for a closed day.
   * If the admin clicks "Reopen" inside the dialog, route to the
   * reopen confirmation here. The reopen action is hidden by the
   * dialog itself when the row isn't reopenable.
   */
  protected openHistoryDetails(day: BusinessDay): void {
    const canReopen =
      day.closedAt !== null && this.currentDay() === null && this.latestClosedId() === day.id;
    const ref = this.dialog.open<
      HistoryDetailsDialog,
      HistoryDetailsDialogData,
      HistoryDetailsDialogResult
    >(HistoryDetailsDialog, {
      width: '640px',
      maxWidth: '95vw',
      panelClass: 'dialog-fullscreen-mobile',
      autoFocus: false,
      data: { day, canReopen },
    });
    ref.afterClosed().subscribe((result) => {
      if (result === 'reopen') this.confirmReopen(day);
      else if (result === 'reprint') this.reprint(day);
    });
  }

  /**
   * Two-step reopen — show a clear confirmation first, then call
   * the API. The backend re-attaches any orphan sales whose date
   * falls within the day's original window, so a missed sale gets
   * caught on the re-close.
   */
  protected confirmReopen(day: BusinessDay): void {
    if (this.currentDay() !== null) {
      this.snackBar.open(
        'Cannot reopen — another business day is currently open. Close it first.',
        'Dismiss',
        { duration: 4000 },
      );
      return;
    }
    const ref = this.dialog.open(ConfirmDialog, {
      width: '500px',
      data: {
        title: 'Reopen this business day?',
        message:
          `This will revert the day from closed to open. The Z-report snapshot ` +
          `is discarded; you'll need to count cash and close again. Any orphan ` +
          `sales (sales recorded without a day attached) made during this day's ` +
          `window will be re-attached so they're counted on the next close.`,
        confirmLabel: 'Reopen day',
        icon: 'lock_open',
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.businessDayService.reopen(day.id).subscribe({
        next: () => {
          this.snackBar.open('Business day reopened.', 'Dismiss', { duration: 2500 });
          // Day is open again — refresh the live preview (it now reflects
          // any reattached orphans), the float log, and the history table.
          this.loadPreview();
          this.loadFloatAdditions();
          this.businessDayService.loadHistory();
        },
        error: (err: HttpErrorResponse) => {
          this.snackBar.open(err.error?.message ?? 'Could not reopen day.', 'Dismiss', {
            duration: 4000,
          });
        },
      });
    });
  }

  private formatOpenedAt(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString();
  }
}
