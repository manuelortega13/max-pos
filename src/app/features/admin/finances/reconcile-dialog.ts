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
import { MatSnackBar } from '@angular/material/snack-bar';
import { AccountReconciliation } from '../../../core/models';
import { FinanceService } from '../../../core/services/finance.service';
import { SettingsService } from '../../../core/services/settings.service';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

export interface ReconcileDialogData {
  readonly accountId: string;
  readonly accountName: string;
  readonly expectedAmount: number;
}

/**
 * Count-and-confirm dialog. The admin enters the physical-count
 * amount; the server snapshots variance and writes an adjustment
 * movement so the running balance now matches.
 */
@Component({
  selector: 'app-reconcile-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="rc__title">
      <mat-icon>fact_check</mat-icon>
      Reconcile {{ data.accountName }}
    </h2>

    <mat-dialog-content class="rc__content">
      <section class="rc__expected">
        <div>
          <small>Expected balance</small>
          <strong>{{ data.expectedAmount | money }}</strong>
        </div>
      </section>

      <mat-form-field appearance="outline" class="rc__field">
        <mat-label>Counted amount</mat-label>
        <span matTextPrefix>{{ currencySymbol() }}&nbsp;</span>
        <input
          matInput
          type="number"
          inputmode="decimal"
          min="0"
          step="0.01"
          [ngModel]="countedText()"
          (ngModelChange)="countedText.set($event)"
          autofocus
        />
      </mat-form-field>

      <mat-form-field appearance="outline" class="rc__field">
        <mat-label>Note (optional)</mat-label>
        <input
          matInput
          [ngModel]="note()"
          (ngModelChange)="note.set($event)"
          maxlength="2048"
          placeholder="e.g. End-of-week count"
        />
      </mat-form-field>

      @if (countedText() !== '' && variance() !== 0) {
        <section class="rc__variance" [class.rc__variance--short]="variance() < 0">
          <small>Variance</small>
          <strong>
            {{ variance() > 0 ? '+' : '' }}{{ variance() | money }}
          </strong>
          <p>
            {{ variance() > 0 ? 'Over' : 'Short' }} — an adjustment movement
            will be written to bring the balance to the counted amount.
          </p>
        </section>
      } @else if (countedText() !== '') {
        <section class="rc__variance rc__variance--match">
          <small>Variance</small>
          <strong>{{ 0 | money }}</strong>
          <p>Matches the expected balance.</p>
        </section>
      }

      @if (error(); as message) {
        <div class="rc__warn" role="alert">
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
        <mat-icon>{{ submitting() ? 'hourglass_empty' : 'fact_check' }}</mat-icon>
        Reconcile
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .rc__title { display: flex; align-items: center; gap: 0.5rem; margin: 0; }
      .rc__content {
        display: flex; flex-direction: column; gap: 0.6rem;
        min-width: min(28rem, 90vw);
      }
      .rc__expected {
        padding: 0.75rem 0.85rem;
        border-radius: 0.5rem;
        background: var(--mat-sys-surface-container-low);
        > div { display: flex; flex-direction: column; gap: 0.15rem; }
        small {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--mat-sys-on-surface-variant);
        }
        strong { font-size: 1.3rem; font-variant-numeric: tabular-nums; }
      }
      .rc__field { width: 100%; }
      .rc__variance {
        padding: 0.75rem 0.85rem;
        border-radius: 0.5rem;
        background: var(--mat-sys-tertiary-container);
        color: var(--mat-sys-on-tertiary-container);

        small {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        strong {
          display: block;
          font-size: 1.4rem;
          font-variant-numeric: tabular-nums;
          margin-top: 0.15rem;
        }
        p {
          margin: 0.4rem 0 0;
          font-size: 0.85rem;
        }
      }
      .rc__variance--short {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .rc__variance--match {
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
      }
      .rc__warn {
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
export class ReconcileDialog {
  private readonly financeService = inject(FinanceService);
  private readonly settingsService = inject(SettingsService);
  private readonly dialogRef = inject(MatDialogRef<ReconcileDialog, AccountReconciliation>);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly data = inject<ReconcileDialogData>(MAT_DIALOG_DATA);

  protected readonly countedText = signal<string | number | null>('');
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

  protected readonly counted = computed(() => this.parseNum(this.countedText()));

  protected readonly variance = computed(() => this.counted() - this.data.expectedAmount);

  protected readonly canSubmit = computed(
    () => !this.submitting() && this.countedText() !== '' && this.counted() >= 0,
  );

  protected submit(): void {
    if (!this.canSubmit()) return;
    const trimmedNote = this.note().trim();
    this.submitting.set(true);
    this.error.set(null);
    this.financeService
      .reconcile({
        accountId: this.data.accountId,
        countedAmount: this.counted(),
        note: trimmedNote === '' ? null : trimmedNote,
      })
      .subscribe({
        next: (rec) => {
          this.snackBar.open(`Reconciled ${this.data.accountName}`, 'Dismiss', {
            duration: 2500,
          });
          this.dialogRef.close(rec);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.error.set(err.error?.message ?? 'Could not reconcile.');
        },
      });
  }
}
