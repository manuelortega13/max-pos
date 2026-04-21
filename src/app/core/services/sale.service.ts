import { Injectable, computed, signal } from '@angular/core';
import { Sale } from '../models';
import { SALES_MOCK } from '../mock-data/sales.mock';

@Injectable({ providedIn: 'root' })
export class SaleService {
  private readonly _sales = signal<Sale[]>(SALES_MOCK);

  readonly sales = this._sales.asReadonly();

  readonly completedSales = computed(() =>
    this._sales().filter((s) => s.status === 'completed'),
  );

  readonly todaySales = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    return this.completedSales().filter((s) => s.date.startsWith(today));
  });

  readonly todayRevenue = computed(() =>
    this.todaySales().reduce((sum, s) => sum + s.total, 0),
  );

  readonly todayTransactionCount = computed(() => this.todaySales().length);

  readonly averageTicket = computed(() => {
    const sales = this.completedSales();
    if (sales.length === 0) return 0;
    return sales.reduce((sum, s) => sum + s.total, 0) / sales.length;
  });

  byCashier(cashierId: string): Sale[] {
    return this._sales().filter((s) => s.cashierId === cashierId);
  }
}
