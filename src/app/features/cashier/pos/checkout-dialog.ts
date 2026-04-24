import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
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

  protected normalizeCash(): void {
    this.cashReceivedText.set(this.cashReceived().toFixed(2));
  }

  /** Receipt details — prefer the backend's canonical values, fall back to
   *  local approximations if the dialog is shown pre-persist (shouldn't happen). */
  protected readonly saleId = computed(() => this.persistedSale()?.reference ?? '—');
  protected readonly completedAt = computed(
    () => (this.persistedSale()?.date ? new Date(this.persistedSale()!.date) : new Date()),
  );

  private readonly cashInputRef = viewChild('cashInput', { read: ElementRef });
  private readonly confirmBtnRef = viewChild('confirmBtn', { read: ElementRef });
  private readonly newSaleBtnRef = viewChild('newSaleBtn', { read: ElementRef });

  constructor() {
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
          console.log('Focused new sale button', this.newSaleBtnRef()?.nativeElement);
        }, 100);
      }
    });
  }

  protected confirm(): void {
    if (this.insufficientCash() || this.submitting()) return;

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
      })
      .subscribe({
        next: (sale) => {
          this.submitting.set(false);
          this.persistedSale.set(sale);
          this.dialogRef.disableClose = true;
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
