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
import { BusinessDayService } from '../../../core/services/business-day.service';
import { SettingsService } from '../../../core/services/settings.service';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

export interface AddToFloatDialogData {
  /** Current opening float (so the dialog can preview the new running total). */
  readonly openingFloat: number;
  /** Sum of prior additions today (excluding voided) for the running total. */
  readonly priorAdditions: number;
}

/**
 * Admin-only dialog for adding cash to the till mid-day. Shows the
 * current running float at the top, the input, and the projected
 * new total below — so the admin sees the impact before confirming.
 */
@Component({
  selector: 'app-add-to-float-dialog',
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
    <h2 mat-dialog-title class="atf__title">
      <mat-icon>add</mat-icon>
      Add to cash float
    </h2>

    <mat-dialog-content class="atf__content">
      <section class="atf__current">
        <div>
          <small>Opening float</small>
          <strong>{{ data.openingFloat | money }}</strong>
        </div>
        @if (data.priorAdditions > 0) {
          <div>
            <small>Prior additions</small>
            <strong>+{{ data.priorAdditions | money }}</strong>
          </div>
        }
        <div class="atf__current-total">
          <small>Float so far</small>
          <strong>{{ currentTotal() | money }}</strong>
        </div>
      </section>

      <mat-form-field appearance="outline" class="atf__field">
        <mat-label>Amount to add</mat-label>
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

      <mat-form-field appearance="outline" class="atf__field">
        <mat-label>Note (optional)</mat-label>
        <input
          matInput
          [ngModel]="note()"
          (ngModelChange)="note.set($event)"
          maxlength="2048"
          placeholder="e.g. Ran out of ₱20 bills for change"
        />
      </mat-form-field>

      @if (amount() > 0) {
        <section class="atf__preview">
          <small>New float total</small>
          <strong>{{ (currentTotal() + amount()) | money }}</strong>
        </section>
      }

      @if (error(); as message) {
        <div class="atf__warn" role="alert">
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
        <mat-icon>{{ submitting() ? 'hourglass_empty' : 'add' }}</mat-icon>
        Add to float
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .atf__title {
        display: flex; align-items: center; gap: 0.5rem; margin: 0;
      }
      .atf__content {
        display: flex; flex-direction: column; gap: 0.85rem;
        min-width: min(28rem, 90vw);
      }
      .atf__current {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
        gap: 0.5rem;
        padding: 0.75rem 0.85rem;
        border-radius: 0.5rem;
        background: var(--mat-sys-surface-container-low);

        > div {
          display: flex; flex-direction: column; gap: 0.15rem;
        }
        small {
          font-size: 0.7rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--mat-sys-on-surface-variant);
        }
        strong {
          font-size: 1rem;
          font-variant-numeric: tabular-nums;
        }
      }
      .atf__current-total strong { color: var(--mat-sys-primary); }
      .atf__field { width: 100%; }
      .atf__preview {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        padding: 0.75rem 0.9rem;
        border-radius: 0.5rem;
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);

        small {
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        strong {
          font-size: 1.4rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
      }
      .atf__warn {
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
export class AddToFloatDialog {
  private readonly businessDayService = inject(BusinessDayService);
  private readonly settingsService = inject(SettingsService);
  private readonly dialogRef = inject(MatDialogRef<AddToFloatDialog>);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly data = inject<AddToFloatDialogData>(MAT_DIALOG_DATA);

  protected readonly amountText = signal<string | number | null>('');
  protected readonly note = signal<string>('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly currencySymbol = computed(
    () => this.settingsService.settings().currencySymbol,
  );

  /** Defensive parser — ngModel on type="number" can hand back
   *  string, number, or null. Same shape as the markup dialog fix. */
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

  protected readonly currentTotal = computed(
    () => this.data.openingFloat + this.data.priorAdditions,
  );

  protected readonly canSubmit = computed(
    () => !this.submitting() && this.amount() > 0,
  );

  protected submit(): void {
    if (!this.canSubmit()) return;
    const trimmedNote = this.note().trim();
    this.submitting.set(true);
    this.error.set(null);
    this.businessDayService
      .addFloatAddition({
        amount: this.amount(),
        note: trimmedNote === '' ? undefined : trimmedNote,
      })
      .subscribe({
        next: (addition) => {
          this.snackBar.open(
            `Added ${this.currencySymbol()}${addition.amount.toFixed(2)} to float`,
            'Dismiss',
            { duration: 2500 },
          );
          this.dialogRef.close(true);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.error.set(err.error?.message ?? 'Could not add to float.');
        },
      });
  }
}
