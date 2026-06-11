import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

export interface ConfirmDialogData {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
  readonly icon?: string;
  /**
   * When set, the confirm button stays disabled until the user types this
   * exact phrase — a deliberate friction gate for irreversible actions
   * (e.g. "RESTORE" before wiping the database).
   */
  readonly requireText?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="confirm__title">
      @if (data.icon) {
        <mat-icon [class.confirm__icon--destructive]="data.destructive">
          {{ data.icon }}
        </mat-icon>
      }
      {{ data.title }}
    </h2>
    <mat-dialog-content>
      <p class="confirm__message">{{ data.message }}</p>
      @if (data.requireText) {
        <mat-form-field appearance="outline" class="confirm__field">
          <mat-label>Type "{{ data.requireText }}" to confirm</mat-label>
          <input
            matInput
            [ngModel]="typed()"
            (ngModelChange)="typed.set($event)"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button mat-dialog-close>
        {{ data.cancelLabel ?? 'Cancel' }}
      </button>
      <button
        mat-flat-button
        [color]="data.destructive ? 'warn' : 'primary'"
        [mat-dialog-close]="true"
        [disabled]="!confirmEnabled()"
      >
        {{ data.confirmLabel ?? 'Confirm' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .confirm__title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0;
      }
      .confirm__icon--destructive {
        color: var(--mat-sys-error);
      }
      .confirm__message {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
        line-height: 1.5;
      }
      .confirm__field {
        width: 100%;
        margin-top: 1rem;
      }
    `,
  ],
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  protected readonly typed = signal('');

  /** Confirm is enabled unless a phrase is required and not yet matched. */
  protected confirmEnabled(): boolean {
    return !this.data.requireText || this.typed().trim() === this.data.requireText;
  }
}
