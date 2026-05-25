import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../../core/services/auth.service';
import { BusinessDayService } from '../../../core/services/business-day.service';
import { Creditor, CreditorPayment, PAYMENT_TERM_LABEL, PaymentMethod, PaymentTerm } from '../../../core/models';
import { CreditorPaymentService } from '../../../core/services/creditor-payment.service';
import { CreditorService } from '../../../core/services/creditor.service';
import { PrinterService } from '../../../core/services/printer.service';
import { SettingsService } from '../../../core/services/settings.service';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

/** "Payment with credit" doesn't make sense — exclude from the toggle. */
type SettlementMethod = Exclude<PaymentMethod, 'CREDIT'>;

@Component({
  selector: 'app-credit-payment-page',
  imports: [
    FormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './credit-payment.page.html',
  styleUrl: './credit-payment.page.scss',
})
export class CreditPaymentPage implements OnInit {
  private readonly creditorService = inject(CreditorService);
  private readonly paymentService = inject(CreditorPaymentService);
  private readonly authService = inject(AuthService);
  private readonly businessDayService = inject(BusinessDayService);
  private readonly settingsService = inject(SettingsService);
  private readonly printerService = inject(PrinterService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly currentDay = this.businessDayService.current;
  protected readonly dayOpen = this.businessDayService.isOpen;
  protected readonly currencySymbol = computed(
    () => this.settingsService.settings().currencySymbol,
  );

  // ───────────────────────── Step 1: creditor ─────────────────────────

  protected readonly creditorQuery = signal<string>('');
  protected readonly selectedCreditor = signal<Creditor | null>(null);

  protected readonly creditorOptions = computed<readonly Creditor[]>(() => {
    const q = this.creditorQuery().trim().toLowerCase();
    const all = this.creditorService.active();
    if (!q) return all;
    const picked = this.selectedCreditor();
    if (picked && this.displayCreditor(picked).toLowerCase() === q) return all;
    return all.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q),
    );
  });

  protected readonly displayCreditor = (c: Creditor | string | null): string => {
    if (!c) return '';
    if (typeof c === 'string') return c;
    return `${c.fullName} · ${c.phone}`;
  };

  protected onCreditorPicked(c: Creditor): void {
    this.selectedCreditor.set(c);
    this.creditorQuery.set(this.displayCreditor(c));
    // Default the amount to the full balance — the cashier will
    // either confirm or type a smaller number. Faster than starting
    // empty when most payments are "pay everything you owe".
    this.amountText.set(c.outstandingBalance.toFixed(2));
  }

  protected clearCreditor(): void {
    this.selectedCreditor.set(null);
    this.creditorQuery.set('');
    this.amountText.set('');
  }

  // ────────────────────── Step 2: amount + method ──────────────────────

  protected readonly amountText = signal<string>('');
  protected readonly paymentMethod = signal<SettlementMethod>('CASH');
  protected readonly notes = signal<string>('');

  protected readonly amount = computed(() => {
    const parsed = parseFloat(this.amountText());
    return Number.isFinite(parsed) ? parsed : 0;
  });

  protected readonly balance = computed(() => this.selectedCreditor()?.outstandingBalance ?? 0);

  /** Hard-block per spec: payment can't exceed current balance. */
  protected readonly overBalance = computed(() => this.amount() > this.balance() + 1e-9);
  protected readonly balanceAfter = computed(() => Math.max(0, this.balance() - this.amount()));

  protected readonly canSubmit = computed(() => {
    if (!this.dayOpen()) return false;
    if (!this.selectedCreditor()) return false;
    if (this.amount() <= 0) return false;
    if (this.overBalance()) return false;
    return true;
  });

  protected normalizeAmount(): void {
    this.amountText.set(this.amount().toFixed(2));
  }

  // ─────────────────────────── Step 3: submit ──────────────────────────

  protected readonly submitting = signal<boolean>(false);
  protected readonly receipt = signal<CreditorPayment | null>(null);

  protected submit(): void {
    if (!this.canSubmit() || this.submitting()) return;
    const c = this.selectedCreditor()!;
    const balanceBefore = this.balance();
    const note = this.notes().trim();

    this.submitting.set(true);
    this.paymentService
      .create({
        creditorId: c.id,
        amount: this.amount(),
        paymentMethod: this.paymentMethod(),
        notes: note === '' ? undefined : note,
      })
      .subscribe({
        next: (payment) => {
          this.submitting.set(false);
          this.receipt.set(payment);
          // Refresh the active creditors list so the picker reflects
          // the new balance the next time it's used.
          this.creditorService.loadActive();
          this.snackBar.open(
            `Recorded ${this.currencySymbol()}${payment.amount.toFixed(2)} from ${c.fullName}`,
            'Dismiss',
            { duration: 2500 },
          );
          // Fire-and-forget print. Same helper-first / browser-fallback
          // path as sale receipts.
          void this.printerService.printCreditPayment({
            storeName: this.settingsService.settings().storeName,
            address: this.settingsService.settings().address,
            phone: this.settingsService.settings().phone,
            footer: this.settingsService.settings().receiptFooter,
            currencySymbol: this.currencySymbol(),
            payment,
            balanceBefore,
            balanceAfter: balanceBefore - payment.amount,
          });
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.snackBar.open(
            err.error?.message ?? 'Could not record payment.',
            'Dismiss',
            { duration: 4000 },
          );
        },
      });
  }

  /** Reset to the empty form. Used by the "New payment" button on
   *  the success screen. */
  protected newPayment(): void {
    this.receipt.set(null);
    this.clearCreditor();
    this.paymentMethod.set('CASH');
    this.notes.set('');
  }

  /** Template helper — strict templates block direct Record lookup. */
  protected termLabel(term: PaymentTerm): string {
    return PAYMENT_TERM_LABEL[term];
  }

  ngOnInit(): void {
    this.creditorService.loadActive();
    this.businessDayService.refreshCurrent().subscribe();
  }
}
