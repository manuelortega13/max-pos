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
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { Product } from '../../../core/models';
import { RestockPayload } from '../../../core/services/product.service';
import { SettingsService } from '../../../core/services/settings.service';

export interface RestockDialogData {
  readonly product: Product;
}

@Component({
  selector: 'app-restock-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './restock-dialog.html',
  styleUrl: './restock-dialog.scss',
})
export class RestockDialog {
  private readonly dialogRef = inject(MatDialogRef<RestockDialog, RestockPayload>);
  private readonly settingsService = inject(SettingsService);
  protected readonly data = inject<RestockDialogData>(MAT_DIALOG_DATA);
  private readonly qtyInputRef = viewChild('qtyInput', { read: ElementRef });

  protected readonly currencySymbol = computed(
    () => this.settingsService.settings().currencySymbol,
  );

  protected readonly quantity = signal<number | null>(1);
  protected readonly expiryDate = signal<Date | null>(null);
  protected readonly costPerUnit = signal<number | null>(null);
  protected readonly note = signal<string>('');

  protected readonly newStock = computed(
    () => this.data.product.stock + (this.quantity() ?? 0),
  );
  protected readonly isValid = computed(() => {
    const q = this.quantity();
    return q !== null && Number.isFinite(q) && q >= 1;
  });

  /** Earliest selectable expiry: today. No one should enter a past expiry. */
  protected readonly minExpiry = new Date();

  constructor() {
    effect(() => {
      const input = this.qtyInputRef()?.nativeElement as HTMLInputElement | undefined;
      if (!input) return;
      setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
    });
  }

  protected confirm(): void {
    if (!this.isValid()) return;
    const d = this.expiryDate();
    const payload: RestockPayload = {
      quantity: this.quantity()!,
      expiryDate: d ? toIsoDate(d) : null,
      costPerUnit: this.costPerUnit(),
      note: this.note()?.trim() || null,
    };
    this.dialogRef.close(payload);
  }
}

function toIsoDate(d: Date): string {
  // YYYY-MM-DD in local time — backend stores as DATE (no time zone).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
