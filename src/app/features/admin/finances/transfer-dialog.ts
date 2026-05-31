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
import { MatSnackBar } from '@angular/material/snack-bar';
import { Account, AccountMovement } from '../../../core/models';
import { FinanceService } from '../../../core/services/finance.service';
import { SettingsService } from '../../../core/services/settings.service';

export interface TransferDialogData {
  readonly accounts: Account[];
  readonly defaultFromAccountId?: string;
}

/**
 * Moves money between two accounts. Server writes a paired
 * OUT/IN movement so reporting nets to zero.
 */
@Component({
  selector: 'app-transfer-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="tx__title">
      <mat-icon>swap_horiz</mat-icon>
      Transfer between accounts
    </h2>

    <mat-dialog-content class="tx__content pt-2!">
      <div class="tx__row">
        <mat-form-field appearance="outline" class="tx__field">
          <mat-label>From</mat-label>
          <mat-select [(ngModel)]="fromAccountId" [disabled]="submitting()">
            @for (a of data.accounts; track a.id) {
              <mat-option [value]="a.id">{{ a.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-icon class="tx__arrow">arrow_forward</mat-icon>

        <mat-form-field appearance="outline" class="tx__field">
          <mat-label>To</mat-label>
          <mat-select [(ngModel)]="toAccountId" [disabled]="submitting()">
            @for (a of data.accounts; track a.id) {
              <mat-option [value]="a.id" [disabled]="a.id === fromAccountId">{{ a.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>

      <mat-form-field appearance="outline" class="tx__field tx__field--full">
        <mat-label>Amount</mat-label>
        <span matTextPrefix>{{ currencySymbol() }}&nbsp;</span>
        <input
          matInput
          type="number"
          inputmode="decimal"
          min="0"
          step="0.01"
          [ngModel]="amountText()"
          (ngModelChange)="amountText.set($event)"
          autofocus
        />
      </mat-form-field>

      <mat-form-field appearance="outline" class="tx__field tx__field--full">
        <mat-label>Note (optional)</mat-label>
        <input
          matInput
          [ngModel]="note()"
          (ngModelChange)="note.set($event)"
          maxlength="2048"
          placeholder="e.g. Deposited cash at the bank"
        />
      </mat-form-field>

      @if (error(); as message) {
        <div class="tx__warn" role="alert">
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
        <mat-icon>{{ submitting() ? 'hourglass_empty' : 'swap_horiz' }}</mat-icon>
        Transfer
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .tx__title { display: flex; align-items: center; gap: 0.5rem; margin: 0; }
      .tx__content {
        display: flex; flex-direction: column; gap: 0.5rem;
        min-width: min(36rem, 92vw);
      }
      .tx__row {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 0.5rem;
      }
      .tx__arrow {
        color: var(--mat-sys-on-surface-variant);
        align-self: center;
        margin-top: -1.5rem;
      }
      .tx__field { width: 100%; }
      .tx__field--full { width: 100%; }
      .tx__warn {
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
export class TransferDialog {
  private readonly financeService = inject(FinanceService);
  private readonly settingsService = inject(SettingsService);
  private readonly dialogRef = inject(MatDialogRef<TransferDialog, AccountMovement[]>);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly data = inject<TransferDialogData>(MAT_DIALOG_DATA);

  protected fromAccountId =
    this.data.defaultFromAccountId ?? this.data.accounts[0]?.id ?? '';
  protected toAccountId =
    this.data.accounts.find((a) => a.id !== this.fromAccountId)?.id ?? '';

  protected readonly amountText = signal<string | number | null>('');
  protected readonly note = signal<string>('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly currencySymbol = computed(
    () => this.settingsService.settings().currencySymbol,
  );

  private parseNum(v: string | number | null): number {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const parsed = parseFloat(String(v).trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  protected readonly amount = computed(() => {
    const v = this.parseNum(this.amountText());
    return v > 0 ? v : 0;
  });

  protected readonly canSubmit = computed(
    () =>
      !this.submitting() &&
      this.amount() > 0 &&
      !!this.fromAccountId &&
      !!this.toAccountId &&
      this.fromAccountId !== this.toAccountId,
  );

  protected submit(): void {
    if (!this.canSubmit()) return;
    const trimmedNote = this.note().trim();
    this.submitting.set(true);
    this.error.set(null);
    this.financeService
      .transfer({
        fromAccountId: this.fromAccountId,
        toAccountId: this.toAccountId,
        amount: this.amount(),
        note: trimmedNote === '' ? null : trimmedNote,
      })
      .subscribe({
        next: (movements) => {
          this.snackBar.open(
            `Transferred ${this.currencySymbol()}${this.amount().toFixed(2)}`,
            'Dismiss',
            { duration: 2500 },
          );
          this.dialogRef.close(movements);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.error.set(err.error?.message ?? 'Could not complete transfer.');
        },
      });
  }
}
