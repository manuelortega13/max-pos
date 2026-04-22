import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Product, ProductBatch } from '../../../core/models';
import { ProductService } from '../../../core/services/product.service';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

export interface BatchesDialogData {
  readonly product: Product;
}

@Component({
  selector: 'app-batches-dialog',
  imports: [
    DatePipe,
    MatDialogModule,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './batches-dialog.html',
  styleUrl: './batches-dialog.scss',
})
export class BatchesDialog {
  private readonly productService = inject(ProductService);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly data = inject<BatchesDialogData>(MAT_DIALOG_DATA);

  protected readonly batches = signal<ProductBatch[]>([]);
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  protected readonly columns = [
    'received',
    'quantity',
    'expiry',
    'cost',
    'note',
    'status',
    'actions',
  ] as const;

  constructor() {
    this.refresh();
  }

  protected refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    this.productService.listBatches(this.data.product.id).subscribe({
      next: (list) => {
        this.batches.set(list);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err.error?.message ?? 'Failed to load batches');
        this.loading.set(false);
      },
    });
  }

  protected writeOff(batch: ProductBatch): void {
    if (batch.writtenOffAt) return;
    this.productService.writeOffBatch(batch.id).subscribe({
      next: () => {
        this.snackBar.open('Batch written off', 'Dismiss', { duration: 2500 });
        this.refresh();
      },
      error: (err: HttpErrorResponse) => {
        const msg =
          err.error?.message ??
          (err.status === 403 ? 'Only admins can write off batches.' : 'Write-off failed.');
        this.snackBar.open(msg, 'Dismiss', { duration: 4000 });
      },
    });
  }

  protected statusOf(batch: ProductBatch): { label: string; cls: string } {
    if (batch.writtenOffAt) return { label: 'Written off', cls: 'batch-chip--off' };
    if (batch.quantityRemaining === 0) return { label: 'Depleted', cls: 'batch-chip--depleted' };
    if (batch.expiryDate && new Date(batch.expiryDate) < new Date()) {
      return { label: 'Expired', cls: 'batch-chip--expired' };
    }
    if (batch.expiryDate) {
      const daysLeft = Math.floor(
        (new Date(batch.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      if (daysLeft <= 30) return { label: `${daysLeft}d left`, cls: 'batch-chip--warn' };
    }
    return { label: 'Active', cls: 'batch-chip--ok' };
  }
}
