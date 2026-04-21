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
import { CartLine, PaymentMethod } from '../../../core/models';
import { SettingsService } from '../../../core/services/settings.service';
import { UserService } from '../../../core/services/user.service';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

export interface CheckoutData {
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
  readonly lines: readonly CartLine[];
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
  private readonly dialogRef = inject(MatDialogRef<CheckoutDialog>);
  private readonly settingsService = inject(SettingsService);
  private readonly userService = inject(UserService);
  protected readonly data = inject<CheckoutData>(MAT_DIALOG_DATA);

  protected readonly settings = this.settingsService.settings;
  protected readonly cashier = this.userService.currentUser;

  protected readonly step = signal<Step>('payment');
  protected readonly paymentMethod = signal<PaymentMethod>('cash');
  protected readonly cashReceivedText = signal<string>(this.data.total.toFixed(2));
  protected readonly cashReceived = computed(() => {
    const parsed = parseFloat(this.cashReceivedText());
    return Number.isFinite(parsed) ? parsed : 0;
  });

  protected readonly change = computed(() =>
    Math.max(0, this.cashReceived() - this.data.total),
  );

  protected readonly insufficientCash = computed(() => {
    if (this.paymentMethod() !== 'cash') return false;
    // Round both sides to 2 decimals to avoid floating-point drift
    // (e.g. 0.1 + 0.2 === 0.30000000000000004), then compare as numbers.
    const received = Math.round(this.cashReceived() * 100);
    const due = Math.round(this.data.total * 100);
    return received < due;
  });

  protected normalizeCash(): void {
    this.cashReceivedText.set(this.cashReceived().toFixed(2));
  }

  protected readonly saleId = `S-${new Date().getFullYear()}-${String(
    Math.floor(Math.random() * 99999),
  ).padStart(5, '0')}`;
  protected readonly completedAt = new Date();

  private readonly cashInputRef = viewChild('cashInput', { read: ElementRef });
  private readonly confirmBtnRef = viewChild('confirmBtn', { read: ElementRef });
  private readonly newSaleBtnRef = viewChild('newSaleBtn', { read: ElementRef });

  constructor() {
    effect(() => {
      const step = this.step();

      if (step === 'payment') {
        const method = this.paymentMethod();
        setTimeout(() => {
          if (method === 'cash') {
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
    if (this.insufficientCash()) return;
    this.dialogRef.disableClose = true;
    this.step.set('receipt');
  }

  protected done(): void {
    this.dialogRef.close(true);
  }
}
