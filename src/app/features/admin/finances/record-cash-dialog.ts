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
import { Account, AccountMovement, MovementDirection } from '../../../core/models';
import { FinanceService } from '../../../core/services/finance.service';
import { SettingsService } from '../../../core/services/settings.service';
import { categoryOptionsFor } from './finances.shared';

export interface RecordCashDialogData {
  readonly direction: MovementDirection;
  /** Active accounts the admin can pick. */
  readonly accounts: Account[];
  /** Pre-select this account (used from drill-in page). */
  readonly defaultAccountId?: string;
}

/**
 * Records a one-off manual IN or OUT against a chosen account.
 * The direction is provided by the caller — same template handles
 * both flavors, only the labels/colors swap.
 */
@Component({
  selector: 'app-record-cash-dialog',
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
    <h2 mat-dialog-title class="rcd__title">
      <mat-icon>{{ isIn() ? 'arrow_downward' : 'arrow_upward' }}</mat-icon>
      Record {{ isIn() ? 'cash in' : 'cash out' }}
    </h2>

    <mat-dialog-content class="rcd__content pt-2!">
      <mat-form-field appearance="outline" class="rcd__field">
        <mat-label>Account</mat-label>
        <mat-select [(ngModel)]="accountId" [disabled]="submitting()">
          @for (a of data.accounts; track a.id) {
            <mat-option [value]="a.id">{{ a.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="rcd__field">
        <mat-label>Category</mat-label>
        <mat-select [(ngModel)]="category" [disabled]="submitting()">
          @for (c of categories; track c.value) {
            <mat-option [value]="c.value">{{ c.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="rcd__field">
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

      <mat-form-field appearance="outline" class="rcd__field">
        <mat-label>Note (optional)</mat-label>
        <input
          matInput
          [ngModel]="note()"
          (ngModelChange)="note.set($event)"
          maxlength="2048"
        />
      </mat-form-field>

      @if (error(); as message) {
        <div class="rcd__warn" role="alert">
          <mat-icon>error_outline</mat-icon>
          <span>{{ message }}</span>
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-stroked-button mat-dialog-close [disabled]="submitting()">Cancel</button>
      <button
        mat-flat-button
        [color]="isIn() ? 'primary' : 'warn'"
        [disabled]="!canSubmit()"
        (click)="submit()"
      >
        <mat-icon>{{ submitting() ? 'hourglass_empty' : (isIn() ? 'arrow_downward' : 'arrow_upward') }}</mat-icon>
        Record {{ isIn() ? 'in' : 'out' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .rcd__title { display: flex; align-items: center; gap: 0.5rem; margin: 0; }
      .rcd__content {
        display: flex; flex-direction: column; gap: 0.5rem;
        min-width: min(28rem, 90vw);
      }
      .rcd__field { width: 100%; }
      .rcd__warn {
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
export class RecordCashDialog {
  private readonly financeService = inject(FinanceService);
  private readonly settingsService = inject(SettingsService);
  private readonly dialogRef = inject(MatDialogRef<RecordCashDialog, AccountMovement>);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly data = inject<RecordCashDialogData>(MAT_DIALOG_DATA);

  protected readonly categories = categoryOptionsFor(this.data.direction);
  protected accountId =
    this.data.defaultAccountId ?? this.data.accounts[0]?.id ?? '';
  protected category = this.categories[0]?.value ?? '';

  protected readonly amountText = signal<string | number | null>('');
  protected readonly note = signal<string>('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly currencySymbol = computed(
    () => this.settingsService.settings().currencySymbol,
  );

  protected readonly isIn = computed(() => this.data.direction === 'IN');

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
      !!this.accountId &&
      !!this.category,
  );

  protected submit(): void {
    if (!this.canSubmit()) return;
    const trimmedNote = this.note().trim();
    this.submitting.set(true);
    this.error.set(null);
    const req = {
      accountId: this.accountId,
      amount: this.amount(),
      category: this.category,
      note: trimmedNote === '' ? null : trimmedNote,
    };
    const obs = this.isIn()
      ? this.financeService.recordIn(req)
      : this.financeService.recordOut(req);
    obs.subscribe({
      next: (movement) => {
        this.snackBar.open(
          `Recorded ${this.isIn() ? 'in' : 'out'} ${this.currencySymbol()}${movement.amount.toFixed(2)}`,
          'Dismiss',
          { duration: 2500 },
        );
        this.dialogRef.close(movement);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err.error?.message ?? 'Could not record movement.');
      },
    });
  }
}
