import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

export interface QuantityDialogData {
  readonly initial?: number;
}

@Component({
  selector: 'app-quantity-dialog',
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
    <h2 mat-dialog-title>
      <mat-icon>calculate</mat-icon>
      Set quantity
    </h2>
    <form (ngSubmit)="apply()">
      <mat-dialog-content class="qty-dialog">
        <p class="qty-dialog__help">
          The next product you tap or scan will be added with this quantity.
        </p>

        <mat-form-field appearance="outline" class="qty-dialog__field">
          <mat-label>Quantity</mat-label>
          <mat-icon matPrefix>close</mat-icon>
          <input
            matInput
            #qtyInput
            type="text"
            inputmode="numeric"
            [ngModel]="quantityText()"
            (ngModelChange)="quantityText.set($event)"
            [ngModelOptions]="{ standalone: true }"
          />
        </mat-form-field>

        <div class="qty-dialog__presets">
          @for (n of presets; track n) {
            <button
              type="button"
              mat-stroked-button
              class="qty-dialog__preset"
              (click)="setPreset(n)"
            >
              ×{{ n }}
            </button>
          }
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button type="button" mat-stroked-button mat-dialog-close>Cancel</button>
        <button
          type="submit"
          mat-flat-button
          color="primary"
          [disabled]="!isValid()"
        >
          <mat-icon>check</mat-icon>
          Apply quantity
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [
    `
      .qty-dialog {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: 420px;
        padding-top: 0.5rem;
      }
      .qty-dialog__help {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
      }
      .qty-dialog__field {
        width: 100%;
      }
      .qty-dialog__presets {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .qty-dialog__preset {
        min-width: 4rem;
        font-weight: 600;
      }
      h2[mat-dialog-title] {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
    `,
  ],
})
export class QuantityDialog {
  private readonly dialogRef = inject(MatDialogRef<QuantityDialog, number>);
  private readonly data = inject<QuantityDialogData | undefined>(MAT_DIALOG_DATA, { optional: true });
  private readonly inputRef = viewChild('qtyInput', { read: ElementRef });

  protected readonly quantityText = signal<string>(String(this.data?.initial ?? 1));
  protected readonly presets = [1, 2, 3, 5, 10, 20, 50] as const;

  protected readonly isValid = () => {
    const n = this.parse();
    return n !== null && n > 0;
  };

  constructor() {
    effect(() => {
      const input = this.inputRef()?.nativeElement as HTMLInputElement | undefined;
      if (!input) return;
      queueMicrotask(() => {
        input.focus();
        input.select();
      });
    });
  }

  protected setPreset(n: number): void {
    this.quantityText.set(String(n));
    this.dialogRef.close(n);
  }

  protected apply(): void {
    const n = this.parse();
    if (n === null || n <= 0) return;
    this.dialogRef.close(n);
  }

  private parse(): number | null {
    const n = parseInt(this.quantityText(), 10);
    return Number.isFinite(n) ? n : null;
  }
}
