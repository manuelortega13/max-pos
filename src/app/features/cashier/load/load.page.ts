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
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { BusinessDayService } from '../../../core/services/business-day.service';
import { CreditorService } from '../../../core/services/creditor.service';
import { LoadService } from '../../../core/services/load.service';
import { PrinterService } from '../../../core/services/printer.service';
import { SettingsService } from '../../../core/services/settings.service';
import { Creditor, LoadFeeTier, LoadTransaction, PaymentMethod } from '../../../core/models';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';

/**
 * Cashier-facing page for cellphone load. Same shape as the GCash
 * cash-in flow:
 *  1. Cashier types the load amount.
 *  2. Page looks up an active tier — if matched, the fee field is
 *     auto-filled and locked; otherwise the cashier types the fee.
 *  3. Required: customer phone (the destination). Optional: promo
 *     text (e.g. "Unli Calls 50") and notes.
 *  4. Confirm → server records the transaction PENDING, returns it.
 *
 * Lookup is debounced (250ms) to avoid request-per-keystroke.
 */
@Component({
  selector: 'app-load-page',
  imports: [
    FormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './load.page.html',
  styleUrl: './load.page.scss',
})
export class LoadPage implements OnInit {
  private readonly loadService = inject(LoadService);
  private readonly businessDayService = inject(BusinessDayService);
  private readonly settingsService = inject(SettingsService);
  private readonly printerService = inject(PrinterService);
  private readonly creditorService = inject(CreditorService);
  private readonly confirmDialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly currentDay = this.businessDayService.current;
  protected readonly dayOpen = this.businessDayService.isOpen;
  protected readonly currencySymbol = computed(
    () => this.settingsService.settings().currencySymbol,
  );

  // ────────────────────────── inputs ───────────────────────────

  protected readonly amountText = signal<string | number | null>('');
  protected readonly feeText = signal<string | number | null>('');
  protected readonly promo = signal<string>('');
  protected readonly customerPhone = signal<string>('');
  protected readonly notes = signal<string>('');

  // ───────────────────── payment method ────────────────────────

  /** CASH (the default — cash at the till) or CREDIT (charged to a
   *  creditor's tab). Loads support only these two. */
  protected readonly paymentMethod = signal<PaymentMethod>('CASH');
  protected readonly isCredit = computed(() => this.paymentMethod() === 'CREDIT');

  /** Creditor picker — same UX as the POS checkout dialog. Live query
   *  bound to the autocomplete input; selectedCreditor is null until a
   *  pick is confirmed. */
  protected readonly creditorQuery = signal<string>('');
  protected readonly selectedCreditor = signal<Creditor | null>(null);

  protected readonly creditorOptions = computed<readonly Creditor[]>(() => {
    const q = this.creditorQuery().trim().toLowerCase();
    const all = this.creditorService.active();
    if (!q) return all;
    // Already-picked: query holds the displayWith string — show all so
    // the cashier can re-pick easily.
    const picked = this.selectedCreditor();
    if (picked && this.displayCreditor(picked).toLowerCase() === q) return all;
    return all.filter(
      (c) => c.fullName.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q),
    );
  });

  protected readonly creditorMissing = computed(
    () => this.isCredit() && this.selectedCreditor() === null,
  );

  /** mat-autocomplete displayWith — what shows in the input after pick. */
  protected readonly displayCreditor = (c: Creditor | string | null): string => {
    if (!c) return '';
    if (typeof c === 'string') return c;
    return `${c.fullName} · ${c.phone}`;
  };

  protected onCreditorPicked(c: Creditor): void {
    this.selectedCreditor.set(c);
    this.creditorQuery.set(this.displayCreditor(c));
  }

  private formatMoney(v: number): string {
    return `${this.currencySymbol()}${v.toFixed(2)}`;
  }

  /** Defensive parse — ngModel on type="number" can send back string,
   *  number, or null. parseFloat alone would NaN on the second two. */
  private parseNum(v: string | number | null): number {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const parsed = parseFloat(String(v).trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  protected readonly amount = computed(() => {
    const v = this.parseNum(this.amountText());
    return v > 0 ? v : 0;
  });

  protected readonly fee = computed(() => {
    const v = this.parseNum(this.feeText());
    return v >= 0 ? v : 0;
  });

  protected readonly phoneMissing = computed(() => this.customerPhone().trim() === '');

  /** Customer hands cash equal to amount + fee. Surfaced prominently
   *  so the cashier doesn't do the math at the till. */
  protected readonly grandTotal = computed(() => this.amount() + this.fee());

  // ─────────────────────── tier resolution ─────────────────────

  protected readonly matchedTier = signal<LoadFeeTier | null>(null);
  protected readonly lookingUp = signal<boolean>(false);
  protected readonly feeLocked = computed(() => this.matchedTier() !== null);

  constructor() {
    // Pre-load active creditors so the picker is ready the instant the
    // cashier flips to Credit. Cashier endpoint — no admin role needed.
    this.creditorService.loadActive();

    // Debounced lookup. Each amount change schedules a 250ms timer;
    // signal re-runs the effect and onCleanup cancels the prior timer.
    effect((onCleanup) => {
      const a = this.amount();
      if (a <= 0) {
        this.matchedTier.set(null);
        return;
      }
      this.lookingUp.set(true);
      const handle = window.setTimeout(() => {
        this.loadService.lookupTier(a).subscribe({
          next: (tier) => {
            this.matchedTier.set(tier);
            this.lookingUp.set(false);
            if (tier) this.feeText.set(tier.fee.toFixed(2));
          },
          error: () => {
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
  protected readonly receipt = signal<LoadTransaction | null>(null);

  protected readonly canSubmit = computed(() => {
    if (!this.dayOpen()) return false;
    if (this.lookingUp()) return false;
    if (this.amount() <= 0) return false;
    if (this.fee() < 0) return false;
    if (this.phoneMissing()) return false;
    if (this.creditorMissing()) return false;
    // Manual-fee mode: require an explicit fee entry (don't silently
    // submit a zero fee just because the field starts empty).
    if (!this.feeLocked() && String(this.feeText() ?? '').trim() === '') return false;
    return true;
  });

  protected async submit(): Promise<void> {
    if (!this.canSubmit() || this.submitting()) return;

    // Soft credit-limit warning — mirrors the POS checkout dialog. The
    // backend doesn't hard-enforce the limit; we ask the cashier to
    // confirm before posting whenever the new total (amount + fee, what
    // the customer owes) would push the creditor past their limit.
    if (this.isCredit()) {
      const c = this.selectedCreditor();
      if (c?.creditLimit != null) {
        const projected = c.outstandingBalance + this.grandTotal();
        if (projected > c.creditLimit) {
          const proceed = await firstValueFrom(
            this.confirmDialog
              .open(ConfirmDialog, {
                width: '460px',
                data: {
                  title: 'Over credit limit',
                  message:
                    `This load puts ${c.fullName} at ${this.formatMoney(projected)}, ` +
                    `which is over their limit of ${this.formatMoney(c.creditLimit)}. ` +
                    `Continue anyway?`,
                  confirmLabel: 'Continue',
                  destructive: false,
                  icon: 'warning',
                },
              })
              .afterClosed(),
          );
          if (!proceed) return;
        }
      }
    }

    const phone = this.customerPhone().trim();
    const promo = this.promo().trim();
    const note = this.notes().trim();
    this.submitting.set(true);
    this.loadService
      .create({
        amount: this.amount(),
        fee: this.fee(),
        promo: promo === '' ? undefined : promo,
        customerPhone: phone,
        notes: note === '' ? undefined : note,
        paymentMethod: this.paymentMethod(),
        creditorId: this.isCredit() ? this.selectedCreditor()?.id : undefined,
      })
      .subscribe({
        next: (txn) => {
          this.submitting.set(false);
          this.receipt.set(txn);
          const who = txn.creditorName
            ? ` on ${txn.creditorName}'s tab`
            : '';
          this.snackBar.open(
            `Recorded load of ${this.currencySymbol()}${txn.amount.toFixed(2)} to ${txn.customerPhone}${who}`,
            'Dismiss',
            { duration: 2500 },
          );
          void this.printerService.printLoadTransaction({
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
            err.error?.message ?? 'Could not record load.',
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
    this.promo.set('');
    this.customerPhone.set('');
    this.notes.set('');
    this.matchedTier.set(null);
    this.paymentMethod.set('CASH');
    this.selectedCreditor.set(null);
    this.creditorQuery.set('');
  }

  protected normalizeAmount(): void {
    if (this.amount() > 0) this.amountText.set(this.amount().toFixed(2));
  }
  protected normalizeFee(): void {
    if (!this.feeLocked()) this.feeText.set(this.fee().toFixed(2));
  }

  ngOnInit(): void {
    this.businessDayService.refreshCurrent().subscribe();
  }
}
