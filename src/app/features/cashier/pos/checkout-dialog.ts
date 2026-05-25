import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { HttpErrorResponse } from '@angular/common/http';
import { CartLine, DiscountInput, PaymentMethod, Sale } from '../../../core/models';
import { SettingsService } from '../../../core/services/settings.service';
import { AuthService } from '../../../core/services/auth.service';
import { SaleService } from '../../../core/services/sale.service';
import { CreditorService } from '../../../core/services/creditor.service';
import { CustomerDisplayService } from '../../../core/services/customer-display.service';
import { PrinterService, ReceiptPayload } from '../../../core/services/printer.service';
import { Creditor } from '../../../core/models';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

export interface CheckoutData {
  /** Sum of line.net — i.e. already net of per-line discounts. */
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
  readonly lines: readonly CartLine[];
  /** Order-level discount input, if any. Forwarded to the create request. */
  readonly orderDiscount: DiscountInput | null;
  /** Money off from the order-level discount, for receipt display. */
  readonly orderDiscountAmount: number;
  /** Combined money off from every per-line discount (receipt summary). */
  readonly lineDiscountTotal: number;
}

type Step = 'payment' | 'receipt';

@Component({
  selector: 'app-checkout-dialog',
  imports: [
    DatePipe,
    FormsModule,
    MatAutocompleteModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout-dialog.html',
  styleUrl: './checkout-dialog.scss',
})
export class CheckoutDialog {
  private readonly dialogRef = inject(MatDialogRef<CheckoutDialog, boolean>);
  private readonly settingsService = inject(SettingsService);
  private readonly authService = inject(AuthService);
  private readonly saleService = inject(SaleService);
  private readonly printerService = inject(PrinterService);
  private readonly customerDisplay = inject(CustomerDisplayService);
  private readonly creditorService = inject(CreditorService);
  private readonly confirmDialog = inject(MatDialog);
  protected readonly data = inject<CheckoutData>(MAT_DIALOG_DATA);

  protected readonly settings = this.settingsService.settings;
  protected readonly cashier = this.authService.user;

  protected readonly step = signal<Step>('payment');
  protected readonly paymentMethod = signal<PaymentMethod>('CASH');
  protected readonly submitting = signal<boolean>(false);
  protected readonly submitError = signal<string | null>(null);
  /** The persisted sale — populated once the backend accepts the POST. */
  protected readonly persistedSale = signal<Sale | null>(null);
  protected readonly cashReceivedText = signal<string>(this.data.total.toFixed(2));
  protected readonly cashReceived = computed(() => {
    const parsed = parseFloat(this.cashReceivedText());
    return Number.isFinite(parsed) ? parsed : 0;
  });

  protected readonly change = computed(() =>
    Math.max(0, this.cashReceived() - this.data.total),
  );

  protected readonly insufficientCash = computed(() => {
    if (this.paymentMethod() !== 'CASH') return false;
    // Round both sides to 2 decimals to avoid floating-point drift
    // (e.g. 0.1 + 0.2 === 0.30000000000000004), then compare as numbers.
    const received = Math.round(this.cashReceived() * 100);
    const due = Math.round(this.data.total * 100);
    return received < due;
  });

  // ─────────────────────── Credit payment ──────────────────────────

  /** Live query bound to the creditor autocomplete input. */
  protected readonly creditorQuery = signal<string>('');
  /** Picked creditor — null until the cashier confirms a selection. */
  protected readonly selectedCreditor = signal<Creditor | null>(null);

  /** Active creditors filtered by the query (name or phone substring). */
  protected readonly creditorOptions = computed<readonly Creditor[]>(() => {
    const q = this.creditorQuery().trim().toLowerCase();
    const all = this.creditorService.active();
    if (!q) return all;
    // Already-picked: query holds the displayWith string. Show all
    // so the cashier can re-pick easily.
    const picked = this.selectedCreditor();
    if (picked && this.displayCreditor(picked).toLowerCase() === q) return all;
    return all.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q),
    );
  });

  /** Confirm button gate. CASH requires sufficient cash; CREDIT
   *  requires a picked creditor; CARD/TRANSFER are unconditional. */
  protected readonly canConfirm = computed(() => {
    switch (this.paymentMethod()) {
      case 'CASH': return !this.insufficientCash();
      case 'CREDIT': return this.selectedCreditor() !== null;
      default: return true;
    }
  });

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

  /** Plain string formatter for the over-limit confirm dialog —
   *  inline pipe in the message text doesn't work since the dialog
   *  is opened with a literal string `message`. */
  private formatMoney(v: number): string {
    return `${this.settings().currencySymbol}${v.toFixed(2)}`;
  }

  protected normalizeCash(): void {
    this.cashReceivedText.set(this.cashReceived().toFixed(2));
  }

  /** Receipt details — prefer the backend's canonical values, fall back to
   *  local approximations if the dialog is shown pre-persist (shouldn't happen). */
  /**
   * Short, human-readable sale number for the receipt. Prefers the
   * backend's sequential `id` over the long `reference` (the latter is
   * the `S-<uuid>` idempotency token, 38 chars — fine for the queue,
   * useless on a 58mm receipt). Falls back to the last 8 chars of the
   * id if it's a UUID-style identifier.
   */
  protected readonly saleId = computed(() => {
    const sale = this.persistedSale();
    if (!sale) return '—';
    const idStr = String(sale.id);
    return idStr.length <= 12 ? `#${idStr}` : `#${idStr.slice(-8).toUpperCase()}`;
  });
  protected readonly completedAt = computed(
    () => (this.persistedSale()?.date ? new Date(this.persistedSale()!.date) : new Date()),
  );

  private readonly cashInputRef = viewChild('cashInput', { read: ElementRef });
  private readonly confirmBtnRef = viewChild('confirmBtn', { read: ElementRef });
  private readonly newSaleBtnRef = viewChild('newSaleBtn', { read: ElementRef });

  constructor() {
    // Lazily fetch the active creditors list — the picker needs it
    // when the cashier flips to CREDIT, and it's cheap enough to
    // always have ready. The cashier endpoint doesn't require admin.
    this.creditorService.loadActive();

    effect(() => {
      const step = this.step();

      if (step === 'payment') {
        const method = this.paymentMethod();
        setTimeout(() => {
          if (method === 'CASH') {
            const input = this.cashInputRef()?.nativeElement as HTMLInputElement | undefined;
            if (!input) return;
            input.focus();
            input.select();
          } else {
            this.confirmBtnRef()?.nativeElement.focus();
          }
        }, 0);
      } else if (step === 'receipt') {
        setTimeout(() => {
          this.newSaleBtnRef()?.nativeElement.focus();
        }, 100);
        // Auto-print is per-device — if this register has it on, fire
        // the print right after the receipt template has rendered.
        //
        // The 200ms delay is only useful for the browser-print fallback
        // (gives Material's dialog content swap time to settle before
        // window.print() snapshots the DOM). When the helper service is
        // the active path, we POST JSON straight to it — no DOM read,
        // no animation to wait for. Skipping the delay shaves a clear
        // 200ms off the perceived "click confirm → receipt prints" gap.
        if (this.printerService.autoPrint()) {
          const delay = this.printerService.helperEnabled() ? 0 : 200;
          setTimeout(() => void this.printerService.printReceipt(this.buildPayload()), delay);
        }
      }
    });
  }

  protected print(): void {
    void this.printerService.printReceipt(this.buildPayload());
  }

  /**
   * Ctrl/Cmd+P on the receipt step routes to our Print button instead
   * of opening the browser's native print dialog. This keeps the
   * helper-service path in play (window.print() would skip it) and
   * mirrors the muscle memory cashiers have from other apps.
   *
   * Bound at document level so it fires whether focus is on the
   * "New sale" button (the default after Confirm payment) or anywhere
   * else inside the dialog.
   */
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (this.step() !== 'receipt') return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      this.print();
      return;
    }
    // Esc on the receipt step closes the dialog. Material's own
    // Esc-to-close behaviour was disabled by dialogRef.disableClose
    // (to block accidental backdrop clicks from losing the receipt);
    // this restores the keyboard path without re-enabling backdrop
    // dismissal.
    if (event.key === 'Escape') {
      event.preventDefault();
      this.done();
    }
  }

  /** Snapshot the current sale into the helper-service payload shape.
   *  Browser fallback path doesn't use it (it reads .print-receipt
   *  from the DOM), but building it once here keeps both code paths
   *  going through the same entry point. */
  private buildPayload(): ReceiptPayload {
    const s = this.settings();
    return {
      storeName: s.storeName,
      address: s.address ?? '',
      phone: s.phone ?? '',
      saleId: this.saleId(),
      date: this.completedAt().toISOString(),
      cashierName: this.cashier()?.name,
      paymentMethod: this.paymentMethod(),
      lines: this.data.lines.map((l) => ({
        name: l.product.name,
        quantity: l.quantity,
        lineTotal: l.product.price * l.quantity,
      })),
      subtotal: this.data.subtotal,
      lineDiscountTotal: this.data.lineDiscountTotal,
      orderDiscountAmount: this.data.orderDiscountAmount,
      tax: this.data.tax,
      total: this.data.total,
      cashReceived: this.paymentMethod() === 'CASH' ? this.cashReceived() : undefined,
      change: this.paymentMethod() === 'CASH' ? this.change() : undefined,
      currencySymbol: s.currencySymbol,
      footer: s.receiptFooter ?? '',
    };
  }

  protected async confirm(): Promise<void> {
    if (!this.canConfirm() || this.submitting()) return;

    // Soft credit-limit warning. The backend doesn't enforce; we
    // ask the cashier to confirm before posting whenever the new
    // total would push the creditor past their limit.
    if (this.paymentMethod() === 'CREDIT') {
      const c = this.selectedCreditor();
      if (c?.creditLimit != null) {
        const projected = c.outstandingBalance + this.data.total;
        if (projected > c.creditLimit) {
          const proceed = await firstValueFrom(
            this.confirmDialog
              .open(ConfirmDialog, {
                width: '460px',
                data: {
                  title: 'Over credit limit',
                  message:
                    `This sale puts ${c.fullName} at ${this.formatMoney(projected)}, ` +
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

    this.submitting.set(true);
    this.submitError.set(null);

    this.saleService
      .create({
        items: this.data.lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          discount: l.discount,
        })),
        paymentMethod: this.paymentMethod(),
        discount: this.data.orderDiscount ?? undefined,
        creditorId: this.paymentMethod() === 'CREDIT'
          ? this.selectedCreditor()?.id
          : undefined,
      })
      .subscribe({
        next: (sale) => {
          this.submitting.set(false);
          this.persistedSale.set(sale);
          this.dialogRef.disableClose = true;
          // Pop the cash drawer the instant the sale persists — the
          // cashier reaches for change while the receipt template
          // renders and the printer feeds. Independent of whether
          // auto-print is on (some registers print, some don't, but
          // the drawer always needs to open for cash flows).
          if (this.printerService.openDrawer()) {
            void this.printerService.kickDrawer();
          }
          // Push the "thank-you" frame to the customer display before
          // the cashier moves on to the receipt step — the customer
          // sees their change immediately.
          const isCash = this.paymentMethod() === 'CASH';
          this.customerDisplay.broadcastCompleted(
            this.data.total,
            isCash ? this.cashReceived() : null,
            isCash ? this.change() : null,
          );
          this.step.set('receipt');
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.submitError.set(this.describeError(err));
        },
      });
  }

  protected done(): void {
    this.dialogRef.close(true);
  }

  private describeError(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Cannot reach the server.';
    const apiMessage =
      err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message?: unknown }).message)
        : null;
    return apiMessage ?? 'Could not complete sale. Please try again.';
  }
}
