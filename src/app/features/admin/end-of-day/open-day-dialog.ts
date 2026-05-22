import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { SettingsService } from '../../../core/services/settings.service';

export interface OpenDayDialogResult {
  readonly openingFloat: number;
}

@Component({
  selector: 'app-open-day-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="open-day__title">
      <mat-icon class="open-day__icon">event_available</mat-icon>
      Open business day
    </h2>
    <mat-dialog-content>
      <p class="open-day__copy">
        Enter the cash currently in the drawer so end-of-day variance is
        computed against the right starting amount. Leave at 0 if the
        drawer is empty.
      </p>
      <mat-form-field appearance="outline" class="open-day__field">
        <mat-label>Opening cash float ({{ currencySymbol() }})</mat-label>
        <input
          matInput
          type="number"
          inputmode="decimal"
          min="0"
          step="0.01"
          [ngModel]="float()"
          (ngModelChange)="float.set($event)"
          autofocus
        />
        <mat-hint>Float + cash sales − cash refunds = expected cash at close.</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button mat-dialog-close>Cancel</button>
      <button
        mat-flat-button
        color="primary"
        [disabled]="!isValid()"
        (click)="confirm()"
      >
        Open day
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .open-day__title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0;
      }
      .open-day__icon { color: var(--mat-sys-primary); }
      .open-day__copy {
        margin: 0 0 1rem;
        line-height: 1.5;
        color: var(--mat-sys-on-surface-variant);
      }
      .open-day__field { width: 100%; }
    `,
  ],
})
export class OpenDayDialog {
  private readonly ref = inject(MatDialogRef<OpenDayDialog, OpenDayDialogResult>);
  private readonly settings = inject(SettingsService);

  protected readonly float = signal<number | null>(0);
  protected readonly currencySymbol = computed(
    () => this.settings.settings().currencySymbol,
  );
  protected readonly isValid = computed(() => {
    const v = this.float();
    return v !== null && !Number.isNaN(v) && v >= 0;
  });

  protected confirm(): void {
    const v = this.float();
    if (v === null || Number.isNaN(v) || v < 0) return;
    this.ref.close({ openingFloat: v });
  }
}
