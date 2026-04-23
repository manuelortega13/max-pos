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
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { Sale, SaleStatus } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { SaleService } from '../../../core/services/sale.service';
import { SettingsService } from '../../../core/services/settings.service';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';
import { RefundDialog, RefundDialogData, RefundDialogResult } from './refund-dialog';

type StatusFilter = SaleStatus | 'all';

@Component({
  selector: 'app-transactions-page',
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
    MatMenuModule,
    MatTableModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transactions.page.html',
  styleUrl: './transactions.page.scss',
})
export class TransactionsPage {
  private readonly saleService = inject(SaleService);
  private readonly authService = inject(AuthService);
  private readonly settingsService = inject(SettingsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly currentUser = this.authService.user;
  protected readonly currencySymbol = computed(
    () => this.settingsService.settings().currencySymbol,
  );

  protected readonly search = signal<string>('');
  protected readonly status = signal<StatusFilter>('all');
  protected readonly fromHour = signal<number | null>(null);
  protected readonly fromMinute = signal<number | null>(null);
  protected readonly toHour = signal<number | null>(null);
  protected readonly toMinute = signal<number | null>(null);
  protected readonly totalMin = signal<number | null>(null);
  protected readonly totalMax = signal<number | null>(null);

  private readonly mySales = computed(() => {
    const user = this.currentUser();
    if (!user) return [];
    return this.saleService.byCashier(user.id);
  });

  protected readonly filteredSales = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.status();
    const fromH = this.fromHour();
    const toH = this.toHour();
    const fromMin = fromH !== null ? fromH * 60 + (this.fromMinute() ?? 0) : null;
    const toMin = toH !== null ? toH * 60 + (this.toMinute() ?? 0) : null;
    const min = this.totalMin();
    const max = this.totalMax();

    return this.mySales().filter((s) => {
      if (status !== 'all' && s.status !== status) return false;
      if (term && !s.reference.toLowerCase().includes(term)) return false;

      if (fromMin !== null || toMin !== null) {
        const sale = new Date(s.date);
        const saleMin = sale.getHours() * 60 + sale.getMinutes();
        if (fromMin !== null && saleMin < fromMin) return false;
        if (toMin !== null && saleMin > toMin) return false;
      }

      if (min != null && s.total < min) return false;
      if (max != null && s.total > max) return false;

      return true;
    });
  });

  protected readonly totals = computed(() => {
    const sales = this.filteredSales().filter((s) => s.status === 'COMPLETED');
    return {
      transactions: sales.length,
      revenue: sales.reduce((sum, s) => sum + s.total, 0),
      items: sales.reduce((sum, s) => sum + s.items.reduce((n, i) => n + i.quantity, 0), 0),
    };
  });

  protected readonly hasTimeFilter = computed(
    () => this.fromHour() !== null || this.toHour() !== null,
  );

  protected readonly hasTotalFilter = computed(
    () => this.totalMin() !== null || this.totalMax() !== null,
  );

  protected readonly hasActiveFilters = computed(
    () =>
      this.search() !== '' ||
      this.status() !== 'all' ||
      this.hasTimeFilter() ||
      this.hasTotalFilter(),
  );

  protected readonly timeLabel = computed(() => {
    const fh = this.fromHour();
    const th = this.toHour();
    const fmt = (h: number | null, m: number | null) =>
      h === null ? '' : `${this.pad2(h)}:${this.pad2(m ?? 0)}`;
    const from = fmt(fh, this.fromMinute());
    const to = fmt(th, this.toMinute());
    if (from && to) return `${from} – ${to}`;
    if (from) return `from ${from}`;
    if (to) return `until ${to}`;
    return '';
  });

  protected readonly totalLabel = computed(() => {
    const min = this.totalMin();
    const max = this.totalMax();
    const sym = this.currencySymbol();
    if (min != null && max != null) return `${sym}${min} – ${sym}${max}`;
    if (min != null) return `min ${sym}${min}`;
    if (max != null) return `max ${sym}${max}`;
    return '';
  });

  protected readonly columns = ['id', 'date', 'items', 'payment', 'total', 'status', 'actions'] as const;

  protected pad2(n: number): string {
    return n.toString().padStart(2, '0');
  }

  protected setStatus(s: StatusFilter): void {
    this.status.set(s);
  }

  protected clearStatus(ev?: Event): void {
    ev?.stopPropagation();
    this.status.set('all');
  }

  protected clearTime(ev?: Event): void {
    ev?.stopPropagation();
    this.fromHour.set(null);
    this.fromMinute.set(null);
    this.toHour.set(null);
    this.toMinute.set(null);
  }

  protected clearTotal(ev?: Event): void {
    ev?.stopPropagation();
    this.totalMin.set(null);
    this.totalMax.set(null);
  }

  protected clearSearch(ev?: Event): void {
    ev?.stopPropagation();
    this.search.set('');
  }

  protected clearFilters(): void {
    this.search.set('');
    this.status.set('all');
    this.clearTime();
    this.clearTotal();
  }

  protected confirmRefund(sale: Sale): void {
    if (sale.status === 'REFUNDED') {
      this.snackBar.open('Already refunded.', 'Dismiss', { duration: 2500 });
      return;
    }
    const data: RefundDialogData = {
      reference: sale.reference,
      itemCount: sale.items.length,
      totalLabel: `${this.currencySymbol()}${sale.total.toFixed(2)}`,
    };
    const ref = this.dialog.open<RefundDialog, RefundDialogData, RefundDialogResult>(
      RefundDialog,
      { width: '480px', panelClass: 'dialog-fullscreen-mobile', data },
    );
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.saleService.refund(sale.id, result.reason).subscribe({
        next: () =>
          this.snackBar.open(`Refunded ${sale.reference}`, 'Dismiss', { duration: 2500 }),
        error: (err: HttpErrorResponse) => {
          this.snackBar.open(err.error?.message ?? 'Refund failed.', 'Dismiss', { duration: 4000 });
        },
      });
    });
  }
}
