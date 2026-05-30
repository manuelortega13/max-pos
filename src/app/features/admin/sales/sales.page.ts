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
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  GcashTransaction,
  LoadTransaction,
  Sale,
  SaleStatus,
} from '../../../core/models';
import { GcashService } from '../../../core/services/gcash.service';
import { LoadService } from '../../../core/services/load.service';
import { SaleService } from '../../../core/services/sale.service';
import { UserService } from '../../../core/services/user.service';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { SaleItemsDialog } from '../../../shared/dialogs/sale-items-dialog';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

type StatusFilter = SaleStatus | 'all' | 'VOIDED';
type SourceFilter = 'all' | 'SALE' | 'GCASH' | 'LOAD';

/**
 * One row in the unified transactions table. Wraps a Sale,
 * GcashTransaction, or LoadTransaction so the template renders
 * them uniformly while keeping the source object available for
 * row actions.
 */
interface TxnRow {
  readonly kind: 'SALE' | 'GCASH_IN' | 'GCASH_OUT' | 'LOAD';
  readonly id: string;
  readonly reference: string;
  readonly date: string;
  readonly cashierId: string;
  readonly cashierName: string;
  readonly itemsCount: number | null;
  readonly typeLabel: string;
  readonly typeIcon: string;
  readonly paymentLabel: string;
  /** Principal cash that changed hands (excludes service fee). */
  readonly principal: number;
  /** Service-fee revenue for GCash / Load rows; null for sales. */
  readonly fee: number | null;
  readonly status: 'COMPLETED' | 'PENDING' | 'REFUNDED' | 'VOIDED';
  readonly sale?: Sale;
  readonly gcash?: GcashTransaction;
  readonly load?: LoadTransaction;
}

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
    MatTooltipModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sales.page.html',
  styleUrl: './sales.page.scss',
})
export class SalesPage {
  private readonly saleService = inject(SaleService);
  private readonly gcashService = inject(GcashService);
  private readonly loadService = inject(LoadService);
  private readonly userService = inject(UserService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly cashiers = this.userService.cashiers;
  protected readonly loading = computed(
    () =>
      this.saleService.loading() ||
      this.gcashService.loading() ||
      this.loadService.loading(),
  );
  protected readonly error = computed(
    () => this.saleService.error() ?? this.gcashService.error() ?? this.loadService.error(),
  );
  protected readonly search = signal('');
  protected readonly status = signal<StatusFilter>('all');
  protected readonly source = signal<SourceFilter>('all');
  protected readonly cashier = signal<string>('all');

  /** Unified row stream — sales + gcash + load merged and date-sorted desc. */
  private readonly allRows = computed<TxnRow[]>(() => {
    const sales = this.saleService.sales().map((s) => this.fromSale(s));
    const gcash = this.gcashService.transactions().map((g) => this.fromGcash(g));
    const load = this.loadService.transactions().map((l) => this.fromLoad(l));
    return [...sales, ...gcash, ...load].sort(
      (a, b) => Date.parse(b.date) - Date.parse(a.date),
    );
  });

  protected readonly rows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.status();
    const source = this.source();
    const cashier = this.cashier();
    return this.allRows().filter((row) => {
      if (source !== 'all') {
        if (source === 'SALE' && row.kind !== 'SALE') return false;
        if (source === 'GCASH' && row.kind !== 'GCASH_IN' && row.kind !== 'GCASH_OUT') return false;
        if (source === 'LOAD' && row.kind !== 'LOAD') return false;
      }
      if (status !== 'all' && row.status !== status) return false;
      if (cashier !== 'all' && row.cashierId !== cashier) return false;
      if (!term) return true;
      return (
        row.reference.toLowerCase().includes(term) ||
        row.cashierName.toLowerCase().includes(term)
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
    this.gcashService.load();
    this.loadService.load();
  }

  protected viewItems(row: TxnRow): void {
    if (row.kind !== 'SALE' || !row.sale) return;
    this.dialog.open(SaleItemsDialog, {
      width: '560px',
      maxWidth: '95vw',
      panelClass: ['sale-items-panel', 'dialog-fullscreen-mobile'],
      autoFocus: false,
      data: row.sale,
    });
  }

  protected confirmRefund(row: TxnRow): void {
    const sale = row.sale;
    if (!sale) return;
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

  /** Service-feature rows can only be voided from their own pages
   *  (GCash / Load admin tabs) so the same admin sees the void
   *  reason flow there. We surface a link instead. */
  protected isServiceRow(row: TxnRow): boolean {
    return row.kind !== 'SALE';
  }

  private fromSale(s: Sale): TxnRow {
    return {
      kind: 'SALE',
      id: s.id,
      reference: s.reference,
      date: s.date,
      cashierId: s.cashierId,
      cashierName: s.cashierName,
      itemsCount: s.items.length,
      typeLabel: 'Sale',
      typeIcon: 'point_of_sale',
      paymentLabel: s.paymentMethod,
      principal: s.total,
      fee: null,
      status: s.status,
      sale: s,
    };
  }

  private fromGcash(g: GcashTransaction): TxnRow {
    const status: TxnRow['status'] = g.voidedAt
      ? 'VOIDED'
      : g.status === 'COMPLETED'
        ? 'COMPLETED'
        : 'PENDING';
    return {
      kind: g.type === 'CASH_IN' ? 'GCASH_IN' : 'GCASH_OUT',
      id: g.id,
      reference: g.reference,
      date: g.date,
      cashierId: g.cashierId,
      cashierName: g.cashierName,
      itemsCount: null,
      typeLabel: g.type === 'CASH_IN' ? 'GCash cash-in' : 'GCash cash-out',
      typeIcon: 'smartphone',
      paymentLabel: 'CASH',
      principal: g.amount,
      fee: g.fee,
      status,
      gcash: g,
    };
  }

  private fromLoad(l: LoadTransaction): TxnRow {
    const status: TxnRow['status'] = l.voidedAt
      ? 'VOIDED'
      : l.status === 'COMPLETED'
        ? 'COMPLETED'
        : 'PENDING';
    return {
      kind: 'LOAD',
      id: l.id,
      reference: l.reference,
      date: l.date,
      cashierId: l.cashierId,
      cashierName: l.cashierName,
      itemsCount: null,
      typeLabel: 'Load',
      typeIcon: 'sim_card',
      paymentLabel: 'CASH',
      principal: l.amount,
      fee: l.fee,
      status,
      load: l,
    };
  }
}
