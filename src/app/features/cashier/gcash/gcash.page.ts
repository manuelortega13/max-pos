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
  protected readonly notes = signal<string>('');

  /** Phone is required for cash-in (cashier sends to this number)
   *  and optional for cash-out (customer already sent to us). */
  protected readonly phoneRequired = computed(() => this.type() === 'CASH_IN');
  protected readonly phoneMissing = computed(
    () => this.phoneRequired() && this.customerPhone().trim() === '',
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
   * Cash the customer hands over (cash-in) or receives (cash-out).
   *
   *   CASH_IN  → amount + fee  (customer pays the GCash amount plus
   *                              the service fee, in cash, at the till)
   *   CASH_OUT → amount − fee  (customer gets the GCash amount minus
   *                              the service fee, in cash, at the till)
   *
   * Surfaced prominently on the page so the cashier sees the exact
   * cash total to collect / hand out without doing the math in their
   * head.
   */
  protected readonly grandTotal = computed(() => {
    if (this.type() === 'CASH_IN') return this.amount() + this.fee();
    return Math.max(0, this.amount() - this.fee());
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
      const a = this.amount();
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
    const note = this.notes().trim();
    this.submitting.set(true);
    this.gcashService
      .create({
        type: this.type(),
        amount: this.amount(),
        fee: this.fee(),
        customerName: name === '' ? undefined : name,
        customerPhone: phone === '' ? undefined : phone,
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
    this.notes.set('');
    this.matchedTier.set(null);
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
