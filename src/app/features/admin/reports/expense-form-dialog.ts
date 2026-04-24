import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Expense, ExpenseUpsertRequest } from '../../../core/models';
import { ExpenseService } from '../../../core/services/expense.service';
import { SettingsService } from '../../../core/services/settings.service';

export type ExpenseFormMode = 'create' | 'edit';

export interface ExpenseFormData {
  readonly mode: ExpenseFormMode;
  readonly expense?: Expense;
}

@Component({
  selector: 'app-expense-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="expense-form__title">
      <mat-icon>receipt</mat-icon>
      {{ data.mode === 'edit' ? 'Edit expense' : 'New expense' }}
    </h2>

    <form [formGroup]="form" (ngSubmit)="submit()">
      <mat-dialog-content class="expense-form">
        <div class="expense-form__row">
          <mat-form-field appearance="outline" class="expense-form__date">
            <mat-label>Date</mat-label>
            <input
              matInput
              [matDatepicker]="picker"
              formControlName="date"
              autocomplete="off"
            />
            <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
            <mat-datepicker #picker></mat-datepicker>
          </mat-form-field>

          <mat-form-field appearance="outline" class="expense-form__amount">
            <mat-label>Amount</mat-label>
            <span matTextPrefix>{{ currencySymbol() }}&nbsp;</span>
            <input
              matInput
              type="number"
              min="0"
              step="0.01"
              formControlName="amount"
            />
            @if (form.controls.amount.touched && form.controls.amount.invalid) {
              <mat-error>Must be ≥ 0</mat-error>
            }
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline">
          <mat-label>Category (optional)</mat-label>
          <input
            matInput
            formControlName="category"
            maxlength="64"
            placeholder="Rent, Utilities, Supplies…"
          />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Description</mat-label>
          <textarea
            matInput
            rows="2"
            formControlName="description"
            maxlength="2048"
          ></textarea>
          @if (form.controls.description.touched && form.controls.description.invalid) {
            <mat-error>Description is required</mat-error>
          }
        </mat-form-field>

        @if (error(); as message) {
          <div class="expense-form__error" role="alert">
            <mat-icon>error_outline</mat-icon>
            <span>{{ message }}</span>
          </div>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button
          type="button"
          mat-stroked-button
          mat-dialog-close
          [disabled]="submitting()"
        >
          Cancel
        </button>
        <button
          type="submit"
          mat-flat-button
          color="primary"
          [disabled]="submitting()"
        >
          <mat-icon>{{ submitting() ? 'hourglass_empty' : 'save' }}</mat-icon>
          {{ submitting() ? 'Saving…' : (data.mode === 'edit' ? 'Save' : 'Add') }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [
    `
      .expense-form__title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0;
      }
      .expense-form {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding-top: 0.5rem;

        @media (min-width: 641px) {
          min-width: 440px;
        }

        mat-form-field { width: 100%; }
      }
      .expense-form__row {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .expense-form__date { flex: 1 1 180px; }
      .expense-form__amount { flex: 1 1 160px; }
      .expense-form__error {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        border-radius: 0.5rem;
        background: rgba(239, 68, 68, 0.1);
        color: var(--mat-sys-error);
        font-size: 0.9rem;
      }
    `,
  ],
})
export class ExpenseFormDialog {
  private readonly fb = inject(FormBuilder);
  private readonly expenseService = inject(ExpenseService);
  private readonly settingsService = inject(SettingsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<ExpenseFormDialog>);
  protected readonly data = inject<ExpenseFormData>(MAT_DIALOG_DATA);

  protected readonly currencySymbol = computed(
    () => this.settingsService.settings().currencySymbol,
  );
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    date: [new Date(), Validators.required],
    category: [''],
    description: ['', [Validators.required, Validators.maxLength(2048)]],
    amount: [0, [Validators.required, Validators.min(0)]],
  });

  constructor() {
    if (this.data.mode === 'edit' && this.data.expense) {
      const e = this.data.expense;
      this.form.patchValue({
        date: new Date(e.date),
        category: e.category ?? '',
        description: e.description,
        amount: e.amount,
      });
    }
  }

  protected submit(): void {
    if (this.submitting()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);

    const value = this.form.getRawValue();
    const request: ExpenseUpsertRequest = {
      date: toISODate(value.date),
      category: value.category.trim() === '' ? null : value.category.trim(),
      description: value.description,
      amount: value.amount,
    };
    const obs = this.data.mode === 'edit' && this.data.expense
      ? this.expenseService.update(this.data.expense.id, request)
      : this.expenseService.create(request);
    obs.subscribe({
      next: () => {
        this.snackBar.open(
          this.data.mode === 'edit' ? 'Expense updated' : 'Expense added',
          'Dismiss',
          { duration: 2000 },
        );
        this.dialogRef.close(true);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(
          err.error?.message ??
            (err.status === 403
              ? 'Only admins can manage expenses.'
              : 'Could not save expense.'),
        );
      },
    });
  }
}

/** Format a Date as `YYYY-MM-DD`, local time (no TZ drift). */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
