import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { LowerCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BusinessDayService } from '../../../core/services/business-day.service';
import { GcashService } from '../../../core/services/gcash.service';
import { PrinterService } from '../../../core/services/printer.service';
import { SettingsService } from '../../../core/services/settings.service';
import {
  GcashFeeTier,
  GcashTransaction,
  GcashTransactionType,
} from '../../../core/models';

/**
 * Cashier-facing page for walk-in GCash service transactions.
 *
 * Flow:
 *  1. Cashier picks Cash-In or Cash-Out.
 *  2. Types the customer's amount.
 *  3. Page looks up an active tier — if matched, the fee field is
 *     auto-filled and locked; otherwise the cashier types the fee
 *     manually.
 *  4. Optional customer reference + notes.
 *  5. Confirm → server validates an open day + that the fee matches
 *     the tier (when one applies), records the transaction, returns
 *     it. Page shows a success card with a "New transaction" button.
 *
 * The tier lookup is debounced via a signal effect so we don't fire
 * a request on every keystroke. While typing, the fee field stays in
 * its last-known mode (locked if previous amount matched a tier,
 * editable if it didn't) and refreshes once the new amount lands.
 */
@Component({
  selector: 'app-gcash-page',
  imports: [
    FormsModule,
    LowerCasePipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gcash.page.html',
  styleUrl: './gcash.page.scss',
})
export class GcashPage implements OnInit {
  private readonly gcashService = inject(GcashService);
  private readonly businessDayService = inject(BusinessDayService);
  private readonly settingsService = inject(SettingsService);
  private readonly printerService = inject(PrinterService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly currentDay = this.businessDayService.current;
  protected readonly dayOpen = this.businessDayService.isOpen;
  protected readonly currencySymbol = computed(
    () => this.settingsService.settings().currencySymbol,
  );

  // ────────────────────────── inputs ───────────────────────────

  protected readonly type = signal<GcashTransactionType>('CASH_IN');
  protected readonly amountText = signal<string>('');
  protected readonly feeText = signal<string>('');
  protected readonly customerName = signal<string>('');
  protected readonly customerPhone = signal<string>('');
  /** Inbound GCash ref — cashier types the last 6 chars of the
   *  "Ref no." their GCash app shows for the customer's incoming
   *  send. Cash-out only. */
  protected readonly inboundRef = signal<string>('');
  protected readonly notes = signal<string>('');

  /** Phone is required for cash-in (cashier sends to this number);
   *  the field doesn't render for cash-out. */
  protected readonly phoneRequired = computed(() => this.type() === 'CASH_IN');
  protected readonly phoneMissing = computed(
    () => this.phoneRequired() && this.customerPhone().trim() === '',
  );

  /** Inbound ref is required for cash-out (the cashier confirms an
   *  inbound GCash arrived before handing cash); not used for cash-in. */
  protected readonly inboundRefRequired = computed(() => this.type() === 'CASH_OUT');
  protected readonly inboundRefMissing = computed(
    () => this.inboundRefRequired() && this.inboundRef().trim() === '',
  );

  protected readonly amount = computed(() => {
    const parsed = parseFloat(this.amountText());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  });

  protected readonly fee = computed(() => {
    const parsed = parseFloat(this.feeText());
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });

  /**
   * Cash-out only: does the GCash amount the customer transferred
   * already include the service fee, or did they add it on top?
   * Default = true (current behavior); the cashier flips it after
   * confirming with the customer.
   *
   *   ON  → amount typed = GCash received. Cash given = amount − fee.
   *         (e.g. customer sent ₱1000, cashier hands ₱980)
   *   OFF → amount typed = cash to hand back. Customer sent fee on
   *         top, so GCash actually received = cash + fee.
   *         (e.g. customer sent ₱1020, cashier hands ₱1000)
   */
  protected readonly feeIncludedInGcashSend = signal<boolean>(true);

  /** Convenience: true only in cash-out + fee-on-top mode. */
  protected readonly cashOutFeeOnTop = computed(
    () => this.type() === 'CASH_OUT' && !this.feeIncludedInGcashSend(),
  );

  /**
   * The GCash amount actually transferred — what the cashier sees in
   * their GCash app and what the backend stores as `amount`. Differs
   * from the typed input only in cash-out + fee-on-top mode, where
   * the cashier types the cash they intend to hand back and the
   * system adds the fee to recover the real transferred amount.
   */
  protected readonly gcashAmountSent = computed(() => {
    if (this.type() === 'CASH_IN') return this.amount();
    return this.cashOutFeeOnTop()
      ? this.amount() + this.fee()
      : this.amount();
  });

  /** Label on the amount input — phrased to match what the cashier
   *  is actually typing in each mode. */
  protected readonly amountLabel = computed(() => {
    if (this.type() === 'CASH_IN') return 'Amount';
    return this.cashOutFeeOnTop() ? 'Cash to hand back' : 'GCash amount sent';
  });

  /**
   * Cash the customer hands over (cash-in) or receives (cash-out).
   *
   *   CASH_IN              → amount + fee (customer pays GCash + fee in cash)
   *   CASH_OUT, fee in     → amount − fee (typed GCash received minus fee)
   *   CASH_OUT, fee on top → amount        (typed cash is what we hand back)
   *
   * Surfaced prominently so the cashier reads the exact cash total
   * without doing the math.
   */
  protected readonly grandTotal = computed(() => {
    if (this.type() === 'CASH_IN') return this.amount() + this.fee();
    return this.cashOutFeeOnTop()
      ? this.amount()
      : Math.max(0, this.amount() - this.fee());
  });

  protected readonly grandTotalLabel = computed(() =>
    this.type() === 'CASH_IN' ? 'Customer pays' : 'Customer receives',
  );

  // ─────────────────────── tier resolution ─────────────────────

  /** The matched tier, or `null` when no active tier covers the
   *  current amount (manual-fee mode). */
  protected readonly matchedTier = signal<GcashFeeTier | null>(null);
  /** `true` while a lookup is in flight — avoids flicker between
   *  the prior tier result and the new one. */
  protected readonly lookingUp = signal<boolean>(false);

  /** Auto-locked when a tier matched. Cashier never gets to lower
   *  the fee in that case — admin's schedule wins. */
  protected readonly feeLocked = computed(() => this.matchedTier() !== null);

  constructor() {
    // Debounced lookup. Each amount change schedules a 250ms
    // timer; if the amount changes again before it fires, the
    // previous timer is canceled. effect() naturally re-runs on
    // signal change so we get cancellation via onCleanup.
    effect((onCleanup) => {
      // Lookup uses the *actual GCash amount transferred* so the
      // correct tier is picked even in cash-out + fee-on-top mode
      // (where the typed value is the cash to hand back, not the
      // GCash). The signal reactivity converges in one or two
      // iterations: the first lookup gives a fee, the new fee
      // shifts gcashAmountSent slightly in fee-on-top mode, which
      // re-triggers the effect; the next lookup either matches the
      // same tier (no-op — signal value unchanged → no further
      // re-runs) or settles on the adjacent tier.
      const a = this.gcashAmountSent();
      if (a <= 0) {
        this.matchedTier.set(null);
        return;
      }
      this.lookingUp.set(true);
      const handle = window.setTimeout(() => {
        this.gcashService.lookupTier(a).subscribe({
          next: (tier) => {
            this.matchedTier.set(tier);
            this.lookingUp.set(false);
            if (tier) {
              // Tier matched → enforce the configured fee. We
              // overwrite whatever the cashier typed: the fee field
              // is locked when a tier matches, so any pre-existing
              // value was from a prior, no-longer-matching amount.
              this.feeText.set(tier.fee.toFixed(2));
            }
          },
          error: () => {
            // Lookup failed — fall back to manual entry rather
            // than blocking the cashier. Server still re-validates.
            this.matchedTier.set(null);
            this.lookingUp.set(false);
          },
        });
      }, 250);
      onCleanup(() => window.clearTimeout(handle));
    });
  }

  // ─────────────────────────── submit ──────────────────────────

  protected readonly submitting = signal<boolean>(false);
  protected readonly receipt = signal<GcashTransaction | null>(null);

  protected readonly canSubmit = computed(() => {
    if (!this.dayOpen()) return false;
    if (this.lookingUp()) return false;
    if (this.amount() <= 0) return false;
    if (this.fee() < 0) return false;
    if (this.phoneMissing()) return false;
    if (this.inboundRefMissing()) return false;
    // Manual-fee mode: don't let the cashier submit a zero fee
    // without typing it (forces a deliberate choice for free
    // service vs. forgetting to enter the fee).
    if (!this.feeLocked() && this.feeText().trim() === '') return false;
    return true;
  });

  protected submit(): void {
    if (!this.canSubmit() || this.submitting()) return;
    const name = this.customerName().trim();
    const phone = this.customerPhone().trim();
    const ref = this.inboundRef().trim();
    const note = this.notes().trim();
    const isCashIn = this.type() === 'CASH_IN';
    this.submitting.set(true);
    this.gcashService
      .create({
        type: this.type(),
        // Backend stores the GCash amount actually transferred — in
        // fee-on-top cash-out mode this differs from the typed value.
        amount: this.gcashAmountSent(),
        fee: this.fee(),
        // Send only the fields that belong to the current direction.
        // Backend strips the other side too, but keeping the wire
        // payload clean makes the request log easier to read.
        customerName: isCashIn && name !== '' ? name : undefined,
        customerPhone: isCashIn && phone !== '' ? phone : undefined,
        inboundRef: !isCashIn && ref !== '' ? ref : undefined,
        notes: note === '' ? undefined : note,
      })
      .subscribe({
        next: (txn) => {
          this.submitting.set(false);
          this.receipt.set(txn);
          this.snackBar.open(
            `Recorded ${this.label(txn.type)} of ${this.currencySymbol()}${txn.amount.toFixed(2)}`,
            'Dismiss',
            { duration: 2500 },
          );
          void this.printerService.printGcashTransaction({
            storeName: this.settingsService.settings().storeName,
            address: this.settingsService.settings().address,
            phone: this.settingsService.settings().phone,
            footer: this.settingsService.settings().receiptFooter,
            currencySymbol: this.currencySymbol(),
            transaction: txn,
          });
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.snackBar.open(
            err.error?.message ?? 'Could not record transaction.',
            'Dismiss',
            { duration: 4000 },
          );
        },
      });
  }

  protected newTransaction(): void {
    this.receipt.set(null);
    this.amountText.set('');
    this.feeText.set('');
    this.customerName.set('');
    this.customerPhone.set('');
    this.inboundRef.set('');
    this.notes.set('');
    this.matchedTier.set(null);
    this.feeIncludedInGcashSend.set(true);
  }

  protected normalizeAmount(): void {
    if (this.amount() > 0) this.amountText.set(this.amount().toFixed(2));
  }
  protected normalizeFee(): void {
    if (!this.feeLocked()) this.feeText.set(this.fee().toFixed(2));
  }

  protected label(t: GcashTransactionType): string {
    return t === 'CASH_IN' ? 'Cash-in' : 'Cash-out';
  }

  ngOnInit(): void {
    this.businessDayService.refreshCurrent().subscribe();
  }
}
