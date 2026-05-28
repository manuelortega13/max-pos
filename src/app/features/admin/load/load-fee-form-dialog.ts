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
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadFeeTier, LoadFeeTierUpsertRequest } from '../../../core/models';
import { LoadService } from '../../../core/services/load.service';
import { SettingsService } from '../../../core/services/settings.service';

export type LoadFeeFormMode = 'create' | 'edit';

export interface LoadFeeFormData {
  readonly mode: LoadFeeFormMode;
  readonly tier?: LoadFeeTier;
  readonly otherActive: readonly LoadFeeTier[];
}

@Component({
  selector: 'app-load-fee-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="lft__title">
      <mat-icon>{{ data.mode === 'edit' ? 'edit' : 'add' }}</mat-icon>
      {{ data.mode === 'edit' ? 'Edit fee tier' : 'Add fee tier' }}
    </h2>

    <form [formGroup]="form" (ngSubmit)="submit()">
      <mat-dialog-content class="lft__content">
        <div class="lft__row">
          <mat-form-field appearance="outline" class="lft__field">
            <mat-label>Min amount</mat-label>
            <span matTextPrefix>{{ currencySymbol() }}&nbsp;</span>
            <input matInput type="number" min="0" step="0.01" formControlName="minAmount" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="lft__field">
            <mat-label>Max amount</mat-label>
            <span matTextPrefix>{{ currencySymbol() }}&nbsp;</span>
            <input matInput type="number" min="0.01" step="0.01" formControlName="maxAmount" />
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline" class="lft__full">
          <mat-label>Service fee</mat-label>
          <span matTextPrefix>{{ currencySymbol() }}&nbsp;</span>
          <input matInput type="number" min="0" step="0.01" formControlName="fee" />
          <mat-hint>
            Charged when a load falls in this range. Range is
            <strong>min ≤ amount &lt; max</strong>.
          </mat-hint>
        </mat-form-field>

        <mat-slide-toggle formControlName="active" class="lft__active">
          Active — used by the cashier lookup
        </mat-slide-toggle>

        @if (error(); as message) {
          <div class="lft__error" role="alert">
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
          {{ data.mode === 'edit' ? 'Save' : 'Add tier' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [
    `
      .lft__title { display: flex; align-items: center; gap: 0.5rem; margin: 0; }
      .lft__content {
        display: flex; flex-direction: column; gap: 0.75rem;
        min-width: min(28rem, 90vw);
      }
      .lft__row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
      }
      .lft__field { width: 100%; }
      .lft__full { width: 100%; }
      .lft__active { margin-top: 0.5rem; }
      .lft__error {
        display: flex; gap: 0.5rem; align-items: flex-start;
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
export class LoadFeeFormDialog {
  private readonly fb = inject(FormBuilder);
  private readonly loadService = inject(LoadService);
  private readonly settingsService = inject(SettingsService);
  private readonly dialogRef = inject(MatDialogRef<LoadFeeFormDialog>);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly data = inject<LoadFeeFormData>(MAT_DIALOG_DATA);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly currencySymbol = computed(
    () => this.settingsService.settings().currencySymbol,
  );

  protected readonly form = this.fb.nonNullable.group({
    minAmount: [0, [Validators.required, Validators.min(0)]],
    maxAmount: [0, [Validators.required, Validators.min(0.01)]],
    fee: [0, [Validators.required, Validators.min(0)]],
    active: [true],
  });

  constructor() {
    if (this.data.tier) this.hydrate(this.data.tier);
  }

  protected submit(): void {
    if (this.submitting() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    if (raw.maxAmount <= raw.minAmount) {
      this.error.set('Max amount must be greater than min amount.');
      return;
    }
    if (raw.active) {
      // Closed-range overlap: [a,b] and [c,d] overlap iff a ≤ d AND
      // c ≤ b. Matches backend rejectOverlap semantics.
      const overlap = this.data.otherActive.find(
        (o) => raw.minAmount <= o.maxAmount && o.minAmount <= raw.maxAmount,
      );
      if (overlap) {
        this.error.set(
          `Range overlaps an existing active tier (${overlap.minAmount}–${overlap.maxAmount}).`,
        );
        return;
      }
    }
    this.submitting.set(true);
    this.error.set(null);
    const req: LoadFeeTierUpsertRequest = {
      minAmount: raw.minAmount,
      maxAmount: raw.maxAmount,
      fee: raw.fee,
      active: raw.active,
    };
    const obs =
      this.data.mode === 'edit' && this.data.tier
        ? this.loadService.updateTier(this.data.tier.id, req)
        : this.loadService.createTier(req);
    obs.subscribe({
      next: () => {
        this.snackBar.open(
          this.data.mode === 'edit' ? 'Tier updated' : 'Tier added',
          'Dismiss',
          { duration: 2500 },
        );
        this.dialogRef.close(true);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err.error?.message ?? 'Could not save tier.');
      },
    });
  }

  private hydrate(t: LoadFeeTier): void {
    this.form.patchValue({
      minAmount: t.minAmount,
      maxAmount: t.maxAmount,
      fee: t.fee,
      active: t.active,
    });
  }
}
