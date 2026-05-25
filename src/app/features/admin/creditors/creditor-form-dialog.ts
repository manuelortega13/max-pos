import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Creditor, CreditorUpsertRequest, PaymentTerm } from '../../../core/models';
import { CreditorService } from '../../../core/services/creditor.service';
import { SettingsService } from '../../../core/services/settings.service';

export type CreditorFormMode = 'create' | 'edit';

export interface CreditorFormData {
  readonly mode: CreditorFormMode;
  readonly creditor?: Creditor;
}

@Component({
  selector: 'app-creditor-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    MatSlideToggleModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="creditor-form__title">
      <mat-icon>{{ data.mode === 'edit' ? 'edit' : 'person_add' }}</mat-icon>
      {{ data.mode === 'edit' ? 'Edit creditor' : 'Add creditor' }}
    </h2>

    <form [formGroup]="form" (ngSubmit)="submit()">
      <mat-dialog-content class="creditor-form__content">
        <mat-form-field appearance="outline" class="creditor-form__full">
          <mat-label>Full name</mat-label>
          <input matInput formControlName="fullName" autocomplete="off" />
          @if (form.controls.fullName.touched && form.controls.fullName.invalid) {
            <mat-error>Full name is required</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="creditor-form__full">
          <mat-label>Phone</mat-label>
          <input matInput formControlName="phone" inputmode="tel" autocomplete="off" />
          @if (form.controls.phone.touched && form.controls.phone.invalid) {
            <mat-error>Phone is required</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="creditor-form__full">
          <mat-label>Address (optional)</mat-label>
          <textarea matInput rows="2" formControlName="address"></textarea>
        </mat-form-field>

        <div class="creditor-form__term">
          <label class="creditor-form__label">Payment term</label>
          <mat-radio-group formControlName="paymentTerm" class="creditor-form__radio-group">
            <mat-radio-button value="FIFTEENTH">On the 15th</mat-radio-button>
            <mat-radio-button value="MONTH_END">End of month</mat-radio-button>
          </mat-radio-group>
        </div>

        <mat-form-field appearance="outline" class="creditor-form__full">
          <mat-label>Credit limit (optional)</mat-label>
          <span matTextPrefix>{{ currencySymbol() }}&nbsp;</span>
          <input
            matInput
            type="number"
            min="0"
            step="0.01"
            formControlName="creditLimit"
            placeholder="Leave blank for no limit"
          />
          <mat-hint>
            Blank means no limit. Cashier sees a soft warning when a credit sale would
            push the balance past this amount.
          </mat-hint>
          @if (form.controls.creditLimit.touched && form.controls.creditLimit.invalid) {
            <mat-error>Must be 0 or greater</mat-error>
          }
        </mat-form-field>

        <mat-slide-toggle formControlName="active" class="creditor-form__active">
          Active — selectable in the POS picker
        </mat-slide-toggle>

        @if (error(); as message) {
          <div class="creditor-form__error" role="alert">
            <mat-icon>error_outline</mat-icon>
            <span>{{ message }}</span>
          </div>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-stroked-button type="button" mat-dialog-close [disabled]="submitting()">
          Cancel
        </button>
        <button
          mat-flat-button
          type="submit"
          color="primary"
          [disabled]="submitting() || form.invalid"
        >
          <mat-icon>{{ submitting() ? 'hourglass_empty' : 'save' }}</mat-icon>
          {{ data.mode === 'edit' ? 'Save' : 'Add creditor' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [
    `
      .creditor-form__title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0;
      }
      .creditor-form__content {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        min-width: min(26rem, 90vw);
      }
      .creditor-form__full { width: 100%; }
      .creditor-form__label {
        display: block;
        font-size: 0.85rem;
        color: var(--mat-sys-on-surface-variant);
        margin-bottom: 0.35rem;
      }
      .creditor-form__radio-group {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .creditor-form__active { margin-top: 0.5rem; }
      .creditor-form__error {
        display: flex;
        gap: 0.5rem;
        align-items: flex-start;
        padding: 0.7rem 0.85rem;
        border-radius: 0.5rem;
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
        font-size: 0.875rem;
        mat-icon { flex-shrink: 0; }
      }
    `,
  ],
})
export class CreditorFormDialog {
  private readonly fb = inject(FormBuilder);
  private readonly creditorService = inject(CreditorService);
  private readonly settingsService = inject(SettingsService);
  private readonly dialogRef = inject(MatDialogRef<CreditorFormDialog>);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly data = inject<CreditorFormData>(MAT_DIALOG_DATA);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly currencySymbol = computed(
    () => this.settingsService.settings().currencySymbol,
  );

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(255)]],
    phone: ['', [Validators.required, Validators.maxLength(64)]],
    address: ['' as string | null, [Validators.maxLength(2048)]],
    paymentTerm: ['FIFTEENTH' as PaymentTerm, [Validators.required]],
    creditLimit: [null as number | null, [Validators.min(0)]],
    active: [true],
  });

  constructor() {
    if (this.data.creditor) this.hydrate(this.data.creditor);
  }

  protected submit(): void {
    if (this.submitting() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);

    const raw = this.form.getRawValue();
    const req: CreditorUpsertRequest = {
      fullName: raw.fullName.trim(),
      phone: raw.phone.trim(),
      address: raw.address && raw.address.trim() !== '' ? raw.address.trim() : null,
      paymentTerm: raw.paymentTerm,
      creditLimit: raw.creditLimit,
      active: raw.active,
    };
    const obs =
      this.data.mode === 'edit' && this.data.creditor
        ? this.creditorService.update(this.data.creditor.id, req)
        : this.creditorService.create(req);

    obs.subscribe({
      next: (c) => {
        const verb = this.data.mode === 'edit' ? 'Updated' : 'Added';
        this.snackBar.open(`${verb} ${c.fullName}`, 'Dismiss', { duration: 2500 });
        this.dialogRef.close(true);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err.error?.message ?? 'Could not save creditor.');
      },
    });
  }

  private hydrate(c: Creditor): void {
    this.form.patchValue({
      fullName: c.fullName,
      phone: c.phone,
      address: c.address ?? '',
      paymentTerm: c.paymentTerm,
      creditLimit: c.creditLimit,
      active: c.active,
    });
  }
}
