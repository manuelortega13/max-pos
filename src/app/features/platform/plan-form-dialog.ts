import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { startWith } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CreatePlanRequest, Plan } from '../../core/models/platform.model';
import { symbolFor } from '../../core/data/currencies';
import { CurrencySelect } from '../../shared/components/currency-select';

export interface PlanFormData {
  /** Existing plan when editing; null/undefined for create. */
  readonly plan?: Plan | null;
}

/**
 * Create or edit a subscription plan. Price is entered in the plan's chosen
 * currency (dollars-style, converted to minor units). The currency is picked
 * on create and locked on edit (it's fixed for the life of the plan). Blank
 * limits mean unlimited; the existing sort order is preserved on edit.
 */
@Component({
  selector: 'app-plan-form-dialog',
  imports: [
    ReactiveFormsModule,
    CurrencySelect,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ isEdit ? 'Edit plan' : 'Add plan' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Code</mat-label>
          <input matInput formControlName="code" placeholder="e.g. starter" />
          <mat-hint>{{
            isEdit ? 'Identifier is fixed.' : 'Lowercase identifier, unique.'
          }}</mat-hint>
        </mat-form-field>
        <app-currency-select formControlName="currency" label="Currency" />
        @if (isEdit) {
          <p class="fixed-note">Currency is fixed once a plan is created.</p>
        }
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Price per month</mat-label>
          <span matTextPrefix>{{ selectedSymbol() }}&nbsp;</span>
          <input matInput type="number" min="0" step="0.01" formControlName="price" />
        </mat-form-field>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Max users</mat-label>
            <input matInput type="number" min="0" formControlName="maxUsers" />
            <mat-hint>Blank = unlimited</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Max products</mat-label>
            <input matInput type="number" min="0" formControlName="maxProducts" />
            <mat-hint>Blank = unlimited</mat-hint>
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Trial days</mat-label>
          <input matInput type="number" min="0" formControlName="trialDays" />
          <mat-hint>0 = not a trial; e.g. 7 for a 7-day free trial</mat-hint>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid" (click)="save()">
        {{ isEdit ? 'Save' : 'Create' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .form {
        display: flex;
        flex-direction: column;
        padding-top: 0.5rem;
        min-width: 340px;
      }
      .w-full {
        width: 100%;
      }
      .row {
        display: flex;
        gap: 0.75rem;
      }
      .row mat-form-field {
        flex: 1;
      }
      .fixed-note {
        margin: -0.5rem 0 0.75rem;
        font-size: 0.75rem;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class PlanFormDialog {
  private readonly fb = inject(FormBuilder);
  private readonly ref = inject(MatDialogRef<PlanFormDialog, CreatePlanRequest>);
  private readonly data = inject<PlanFormData>(MAT_DIALOG_DATA, { optional: true });

  protected readonly isEdit = !!this.data?.plan;
  private readonly sortOrder = this.data?.plan?.sortOrder ?? 0;
  private readonly initialCurrency = this.data?.plan?.currency ?? 'USD';

  protected readonly form = this.fb.group({
    name: [this.data?.plan?.name ?? '', [Validators.required, Validators.maxLength(80)]],
    code: [
      { value: this.data?.plan?.code ?? '', disabled: this.isEdit },
      [Validators.required, Validators.maxLength(32)],
    ],
    // Locked on edit — the currency can't change once the plan exists.
    currency: [{ value: this.initialCurrency, disabled: this.isEdit }, [Validators.required]],
    price: [(this.data?.plan?.priceCents ?? 0) / 100, [Validators.required, Validators.min(0)]],
    maxUsers: [this.data?.plan?.maxUsers ?? null, [Validators.min(0)]],
    maxProducts: [this.data?.plan?.maxProducts ?? null, [Validators.min(0)]],
    trialDays: [this.data?.plan?.trialDays ?? 0, [Validators.required, Validators.min(0)]],
  });

  /** Symbol of the currently selected currency, for the price-field prefix. */
  private readonly currencyCode = toSignal(
    this.form.controls.currency.valueChanges.pipe(startWith(this.initialCurrency)),
    { initialValue: this.initialCurrency },
  );
  protected readonly selectedSymbol = computed(() => symbolFor(this.currencyCode()));

  protected save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const currency = (v.currency ?? 'USD').toUpperCase();
    this.ref.close({
      name: v.name!.trim(),
      code: v.code!.trim().toLowerCase(),
      priceCents: Math.round((v.price ?? 0) * 100),
      currency,
      currencySymbol: symbolFor(currency),
      maxUsers: v.maxUsers ?? null,
      maxProducts: v.maxProducts ?? null,
      sortOrder: this.sortOrder,
      trialDays: v.trialDays ?? 0,
    });
  }
}
