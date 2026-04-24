import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { DiscountInput, DiscountType } from '../../core/models';
import { MoneyPipe } from '../pipes/currency-symbol.pipe';

export interface DiscountDialogData {
  /**
   * What the discount applies to — "Coffee" for a line, "Sale total" for
   * the order. Shown in the dialog title for context.
   */
  readonly target: string;
  /** Pre-discount amount the discount will be applied against. */
  readonly baseAmount: number;
  /** Current discount, if one already exists (edit mode). */
  readonly current?: DiscountInput | null;
}

/**
 * Result object returned from the dialog:
 *  - `{ discount: null }` → the user removed the discount.
 *  - `{ discount: {...} }` → apply / replace.
 *  - The dialog closes with `undefined` on Cancel.
 */
export interface DiscountDialogResult {
  readonly discount: DiscountInput | null;
}

@Component({
  selector: 'app-discount-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="discount__title">
      <mat-icon>local_offer</mat-icon>
      Discount on {{ data.target }}
    </h2>
    <mat-dialog-content class="discount__content">
      <p class="discount__base">
        Current amount
        <strong>{{ data.baseAmount | money }}</strong>
      </p>

      <mat-button-toggle-group
        class="discount__type"
        hideSingleSelectionIndicator
        [value]="type()"
        (change)="type.set($event.value)"
      >
        <mat-button-toggle value="PERCENT">
          <mat-icon>percent</mat-icon>
          Percent
        </mat-button-toggle>
        <mat-button-toggle value="FIXED">
          <mat-icon>attach_money</mat-icon>
          Fixed amount
        </mat-button-toggle>
      </mat-button-toggle-group>

      <mat-form-field appearance="outline" class="discount__field">
        <mat-label>{{ type() === 'PERCENT' ? 'Percent off' : 'Amount off' }}</mat-label>
        @if (type() === 'PERCENT') {
          <span matTextSuffix>&nbsp;%</span>
        }
        <input
          matInput
          #valueInput
          type="number"
          inputmode="decimal"
          min="0"
          [max]="type() === 'PERCENT' ? 100 : data.baseAmount"
          step="0.01"
          [ngModel]="valueText()"
          (ngModelChange)="valueText.set($event)"
          (focus)="valueInput.select()"
          (keydown.enter)="onEnter()"
        />
        @if (exceedsLimit()) {
          <mat-hint class="discount__hint-error">
            @if (type() === 'PERCENT') {
              Capped at 100%
            } @else {
              Capped at {{ data.baseAmount | money }}
            }
          </mat-hint>
        }
      </mat-form-field>

      <div class="discount__preview">
        <div class="discount__preview-row">
          <span>Discount</span>
          <span class="discount__preview-off">−{{ discountAmount() | money }}</span>
        </div>
        <div class="discount__preview-row discount__preview-row--total">
          <span>New amount</span>
          <strong>{{ newAmount() | money }}</strong>
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="discount__actions">
      @if (data.current) {
        <button
          mat-stroked-button
          color="warn"
          type="button"
          class="discount__remove"
          (click)="remove()"
        >
          <mat-icon>close</mat-icon>
          Remove
        </button>
      }
      <button mat-stroked-button mat-dialog-close>Cancel</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="!canApply()"
        (click)="apply()"
      >
        Apply
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .discount__title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0;
      }
      .discount__content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: 0;
      }
      @media (min-width: 641px) {
        .discount__content { min-width: 380px; }
      }
      .discount__base {
        margin: 0;
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        color: var(--mat-sys-on-surface-variant);
      }
      .discount__base strong {
        font-size: 1.1rem;
        color: var(--mat-sys-on-surface);
        font-variant-numeric: tabular-nums;
      }
      .discount__type {
        width: 100%;
      }
      .discount__type ::ng-deep .mat-button-toggle {
        flex: 1;
      }
      .discount__type ::ng-deep .mat-button-toggle-label-content {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        justify-content: center;
      }
      .discount__field { width: 100%; }
      .discount__hint-error { color: var(--mat-sys-error); }
      .discount__preview {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: 0.85rem 1rem;
        border-radius: 0.6rem;
        background: var(--mat-sys-surface-container);
        font-variant-numeric: tabular-nums;
      }
      .discount__preview-row {
        display: flex;
        justify-content: space-between;
        color: var(--mat-sys-on-surface-variant);
      }
      .discount__preview-off { color: var(--mat-sys-error); }
      .discount__preview-row--total {
        color: var(--mat-sys-on-surface);
        font-weight: 600;
        padding-top: 0.35rem;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }
      .discount__actions { gap: 0.5rem; }
      .discount__remove { margin-right: auto; }
    `,
  ],
})
export class DiscountDialog {
  protected readonly data = inject<DiscountDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(
    MatDialogRef<DiscountDialog, DiscountDialogResult>,
  );

  // Keep the input as a string so we can tell "empty" apart from 0 and
  // avoid rounding artifacts during typing (parseFloat('.5') = 0.5 etc.).
  protected readonly type = signal<DiscountType>(this.data.current?.type ?? 'PERCENT');
  protected readonly valueText = signal<string>(
    this.data.current?.value != null ? String(this.data.current.value) : '',
  );

  protected readonly parsedValue = computed(() => {
    const raw = parseFloat(this.valueText());
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  });

  protected readonly exceedsLimit = computed(() => {
    const v = this.parsedValue();
    if (v <= 0) return false;
    return this.type() === 'PERCENT' ? v > 100 : v > this.data.baseAmount;
  });

  protected readonly discountAmount = computed(() => {
    const v = this.parsedValue();
    if (v <= 0) return 0;
    const raw =
      this.type() === 'PERCENT' ? (this.data.baseAmount * v) / 100 : v;
    return Math.round(Math.min(raw, this.data.baseAmount) * 100) / 100;
  });

  protected readonly newAmount = computed(() =>
    Math.max(0, this.data.baseAmount - this.discountAmount()),
  );

  protected readonly canApply = computed(() => this.parsedValue() > 0);

  protected apply(): void {
    if (!this.canApply()) return;
    // Clamp the stored value to the valid range, so if someone types 120%
    // we persist 100 (matching what the preview shows).
    const clamped =
      this.type() === 'PERCENT'
        ? Math.min(100, this.parsedValue())
        : Math.min(this.data.baseAmount, this.parsedValue());
    this.ref.close({
      discount: { type: this.type(), value: clamped },
    });
  }

  protected remove(): void {
    this.ref.close({ discount: null });
  }

  protected onEnter(): void {
    if (this.canApply()) this.apply();
  }
}
