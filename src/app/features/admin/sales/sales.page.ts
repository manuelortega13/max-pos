import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { Sale, SaleStatus } from '../../../core/models';
import { SaleService } from '../../../core/services/sale.service';
import { UserService } from '../../../core/services/user.service';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

type StatusFilter = SaleStatus | 'all';

@Component({
  selector: 'app-sales-page',
  imports: [
    DatePipe,
    TitleCasePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    MatMenuModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sales.page.html',
  styleUrl: './sales.page.scss',
})
export class SalesPage {
  private readonly saleService = inject(SaleService);
  private readonly userService = inject(UserService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly cashiers = this.userService.cashiers;
  protected readonly loading = this.saleService.loading;
  protected readonly error = this.saleService.error;
  protected readonly search = signal('');
  protected readonly status = signal<StatusFilter>('all');
  protected readonly cashier = signal<string>('all');

  protected readonly rows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.status();
    const cashier = this.cashier();
    return this.saleService.sales().filter((sale) => {
      if (status !== 'all' && sale.status !== status) return false;
      if (cashier !== 'all' && sale.cashierId !== cashier) return false;
      if (!term) return true;
      return (
        sale.reference.toLowerCase().includes(term) ||
        sale.cashierName.toLowerCase().includes(term)
      );
    });
  });

  protected readonly columns = [
    'id',
    'date',
    'cashier',
    'items',
    'payment',
    'total',
    'status',
    'actions',
  ] as const;

  protected retry(): void {
    this.saleService.load();
  }

  protected confirmRefund(sale: Sale): void {
    if (sale.status === 'REFUNDED') {
      this.snackBar.open('Already refunded.', 'Dismiss', { duration: 2500 });
      return;
    }
    const ref = this.dialog.open(ConfirmDialog, {
      width: '460px',
      data: {
        title: 'Refund sale',
        message: `Refund sale ${sale.reference} (${sale.items.length} items)? Stock returns to inventory as a new batch.`,
        confirmLabel: 'Refund',
        destructive: true,
        icon: 'undo',
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.saleService.refund(sale.id).subscribe({
        next: () => this.snackBar.open(`Refunded ${sale.reference}`, 'Dismiss', { duration: 2500 }),
        error: (err: HttpErrorResponse) => {
          this.snackBar.open(err.error?.message ?? 'Refund failed.', 'Dismiss', { duration: 4000 });
        },
      });
    });
  }
}
