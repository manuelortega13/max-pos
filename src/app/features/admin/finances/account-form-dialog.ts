import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ACCOUNT_KIND_LABELS,
  Account,
  AccountKind,
} from '../../../core/models';
import { FinanceService } from '../../../core/services/finance.service';

export interface AccountFormDialogData {
  /** Existing account when editing; null/undefined for create. */
  readonly account?: Account | null;
}

const ACCOUNT_KINDS: AccountKind[] = [
  'CASH',
  'GCASH',
  'MAYA',
  'BANK',
  'LOAD_WALLET',
  'RECEIVABLES',
  'OTHER',
];

/**
 * Create or edit a finance account. The Cash account is special-cased
 * server-side (lookup-by-kind), but the admin can rename it here for
 * display purposes.
 */
@Component({
  selector: 'app-account-form-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="afd__title">
      <mat-icon>{{ data.account ? 'edit' : 'add' }}</mat-icon>
      {{ data.account ? 'Edit account' : 'New account' }}
    </h2>

    <mat-dialog-content class="afd__content pt-2!">
      <mat-form-field appearance="outline" class="afd__field">
        <mat-label>Name</mat-label>
        <input matInput [(ngModel)]="name" maxlength="64" autofocus />
      </mat-form-field>

      <mat-form-field appearance="outline" class="afd__field">
        <mat-label>Kind</mat-label>
        <mat-select [(ngModel)]="kind">
          @for (k of kinds; track k) {
            <mat-option [value]="k">{{ labels[k] }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="afd__field">
        <mat-label>Sort order</mat-label>
        <input
          matInput
          type="number"
          inputmode="numeric"
          step="1"
          [(ngModel)]="sortOrder"
        />
      </mat-form-field>

      <mat-slide-toggle [(ngModel)]="active" class="afd__toggle">
        Active
      </mat-slide-toggle>

      @if (error(); as message) {
        <div class="afd__warn" role="alert">
          <mat-icon>error_outline</mat-icon>
          <span>{{ message }}</span>
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-stroked-button mat-dialog-close [disabled]="submitting()">Cancel</button>
      <button
        mat-flat-button
        color="primary"
        [disabled]="!canSubmit()"
        (click)="submit()"
      >
        <mat-icon>{{ submitting() ? 'hourglass_empty' : 'save' }}</mat-icon>
        Save
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .afd__title { display: flex; align-items: center; gap: 0.5rem; margin: 0; }
      .afd__content {
        display: flex; flex-direction: column; gap: 0.5rem;
        min-width: min(26rem, 90vw);
      }
      .afd__field { width: 100%; }
      .afd__toggle { margin: 0.25rem 0 0.5rem; }
      .afd__warn {
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
export class AccountFormDialog {
  private readonly financeService = inject(FinanceService);
  private readonly dialogRef = inject(MatDialogRef<AccountFormDialog, Account>);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly data = inject<AccountFormDialogData>(MAT_DIALOG_DATA);

  protected readonly kinds = ACCOUNT_KINDS;
  protected readonly labels = ACCOUNT_KIND_LABELS;

  protected name = this.data.account?.name ?? '';
  protected kind: AccountKind = this.data.account?.kind ?? 'OTHER';
  protected active = this.data.account?.active ?? true;
  protected sortOrder = this.data.account?.sortOrder ?? 100;

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly canSubmit = computed(
    () => !this.submitting() && this.name.trim().length > 0,
  );

  protected submit(): void {
    if (!this.canSubmit()) return;
    this.submitting.set(true);
    this.error.set(null);
    const req = {
      name: this.name.trim(),
      kind: this.kind,
      active: this.active,
      sortOrder: this.sortOrder,
    };
    const obs = this.data.account
      ? this.financeService.updateAccount(this.data.account.id, req)
      : this.financeService.createAccount(req);
    obs.subscribe({
      next: (saved) => {
        this.snackBar.open(`Account "${saved.name}" saved`, 'Dismiss', {
          duration: 2500,
        });
        this.dialogRef.close(saved);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err.error?.message ?? 'Could not save account.');
      },
    });
  }
}
