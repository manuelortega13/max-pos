import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Expense, Sale } from '../../../core/models';
import { ExpenseService } from '../../../core/services/expense.service';
import { ProductService } from '../../../core/services/product.service';
import { SaleService } from '../../../core/services/sale.service';
import { SettingsService } from '../../../core/services/settings.service';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';
import { ExpenseFormDialog, ExpenseFormData } from './expense-form-dialog';

type RangePreset = 'today' | 'week' | 'month' | 'year' | 'custom';

@Component({
  selector: 'app-reports-page',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
    MoneyPipe,
  ],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reports.page.html',
  styleUrl: './reports.page.scss',
})
export class ReportsPage {
  private readonly saleService = inject(SaleService);
  private readonly expenseService = inject(ExpenseService);
  private readonly productService = inject(ProductService);
  private readonly settingsService = inject(SettingsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly fromDate = signal<Date>(startOfMonth(new Date()));
  protected readonly toDate = signal<Date>(new Date());
  protected readonly preset = signal<RangePreset>('month');
  protected readonly exporting = signal<boolean>(false);

  protected readonly expenses = this.expenseService.expenses;
  protected readonly expensesLoading = this.expenseService.loading;
  protected readonly currencySymbol = computed(
    () => this.settingsService.settings().currencySymbol,
  );

  /** Sales that fall inside the selected date range, status = COMPLETED. */
  protected readonly rangeSales = computed<readonly Sale[]>(() => {
    const from = startOfDay(this.fromDate()).getTime();
    const to = endOfDay(this.toDate()).getTime();
    return this.saleService.sales().filter((s) => {
      if (s.status !== 'COMPLETED') return false;
      const t = new Date(s.date).getTime();
      return t >= from && t <= to;
    });
  });

  /**
   * Revenue = sum of sale.subtotal − sale.discountAmount (post line+order
   * discount, pre-tax). Tax is excluded because it's a pass-through to
   * the government, not real revenue for the store.
   */
  protected readonly revenue = computed(() =>
    round2(this.rangeSales().reduce((sum, s) => {
      const orderDiscount = Number(s.discountAmount ?? 0);
      return sum + Number(s.subtotal) - orderDiscount;
    }, 0)),
  );

  /** COGS = sum of unit_cost × qty across every sold line item in range. */
  protected readonly cogs = computed(() => {
    let total = 0;
    for (const sale of this.rangeSales()) {
      for (const item of sale.items) {
        // unitCost is null for pre-V14 historical rows — fall back to the
        // product's current cost so old data still produces a number.
        const cost =
          item.unitCost ?? this.productService.getById(item.productId)?.cost ?? 0;
        total += Number(cost) * item.quantity;
      }
    }
    return round2(total);
  });

  protected readonly grossProfit = computed(() => round2(this.revenue() - this.cogs()));
  protected readonly totalExpenses = computed(() => round2(this.expenseService.total()));
  protected readonly netProfit = computed(() =>
    round2(this.grossProfit() - this.totalExpenses()),
  );

  protected readonly grossMargin = computed(() => {
    const r = this.revenue();
    return r > 0 ? (this.grossProfit() / r) * 100 : 0;
  });

  protected readonly columns = ['date', 'category', 'description', 'amount', 'actions'] as const;

  constructor() {
    // Refetch expenses whenever the range changes; sales are already loaded
    // into SaleService by the admin layout and are filtered client-side.
    effect(() => {
      const from = toISODate(this.fromDate());
      const to = toISODate(this.toDate());
      this.expenseService.load(from, to);
    });
  }

  protected applyPreset(preset: RangePreset): void {
    const now = new Date();
    this.preset.set(preset);
    switch (preset) {
      case 'today':
        this.fromDate.set(startOfDay(now));
        this.toDate.set(now);
        return;
      case 'week': {
        const d = new Date(now);
        d.setDate(d.getDate() - 6);
        this.fromDate.set(startOfDay(d));
        this.toDate.set(now);
        return;
      }
      case 'month':
        this.fromDate.set(startOfMonth(now));
        this.toDate.set(now);
        return;
      case 'year':
        this.fromDate.set(new Date(now.getFullYear(), 0, 1));
        this.toDate.set(now);
        return;
      case 'custom':
        // Honour whatever's already in the pickers.
        return;
    }
  }

  protected onFromDateChange(d: Date | null): void {
    if (!d) return;
    this.fromDate.set(d);
    this.preset.set('custom');
  }

  protected onToDateChange(d: Date | null): void {
    if (!d) return;
    this.toDate.set(d);
    this.preset.set('custom');
  }

  protected openCreateExpense(): void {
    this.openExpenseDialog({ mode: 'create' });
  }

  protected openEditExpense(expense: Expense): void {
    this.openExpenseDialog({ mode: 'edit', expense });
  }

  private openExpenseDialog(data: ExpenseFormData): void {
    this.dialog.open(ExpenseFormDialog, {
      width: '540px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      panelClass: 'dialog-fullscreen-mobile',
      data,
    });
  }

  protected confirmDelete(expense: Expense): void {
    const ref = this.dialog.open(ConfirmDialog, {
      width: '440px',
      data: {
        title: 'Delete expense',
        message: `Delete "${expense.description}" (${this.currencySymbol()}${expense.amount})?`,
        confirmLabel: 'Delete',
        destructive: true,
        icon: 'delete',
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.expenseService.delete(expense.id).subscribe({
        next: () => this.snackBar.open('Expense deleted', 'Dismiss', { duration: 2000 }),
        error: (err: HttpErrorResponse) => {
          this.snackBar.open(
            err.error?.message ?? 'Could not delete expense.',
            'Dismiss',
            { duration: 3000 },
          );
        },
      });
    });
  }

  // ─── Exports ────────────────────────────────────────────────────────────

  protected exportCsv(): void {
    const rows = this.buildReportRows();
    const csv = rowsToCsv(rows);
    const filename = `maxpos-report-${toISODate(this.fromDate())}_to_${toISODate(this.toDate())}.csv`;
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
  }

  protected async exportXlsx(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      const xlsx = await import('xlsx');
      const rows = this.buildReportRows();
      const ws = xlsx.utils.aoa_to_sheet(rows);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Report');
      const buf = xlsx.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
      const filename = `maxpos-report-${toISODate(this.fromDate())}_to_${toISODate(this.toDate())}.xlsx`;
      downloadBlob(
        new Blob([buf], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        filename,
      );
    } catch (err) {
      console.warn('[reports] XLSX export failed', err);
      this.snackBar.open('Could not generate the spreadsheet.', 'Dismiss', { duration: 3000 });
    } finally {
      this.exporting.set(false);
    }
  }

  protected async exportPdf(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      const jspdfMod = await import('jspdf');
      const autotableMod = await import('jspdf-autotable');
      const JsPDF = jspdfMod.default;
      const autoTable = (autotableMod as unknown as {
        default: (doc: object, opts: object) => void;
      }).default;

      const doc = new JsPDF({ unit: 'pt', format: 'a4' });
      const sym = this.currencySymbol();
      const from = toISODate(this.fromDate());
      const to = toISODate(this.toDate());

      doc.setFontSize(16);
      doc.text('MaxPOS profit report', 40, 48);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${from} — ${to}`, 40, 66);
      doc.setTextColor(0);

      const summary: [string, string][] = [
        ['Revenue', `${sym}${this.revenue().toFixed(2)}`],
        ['COGS', `${sym}${this.cogs().toFixed(2)}`],
        [
          'Gross profit',
          `${sym}${this.grossProfit().toFixed(2)} (${this.grossMargin().toFixed(1)}%)`,
        ],
        ['Expenses', `${sym}${this.totalExpenses().toFixed(2)}`],
        ['Net profit', `${sym}${this.netProfit().toFixed(2)}`],
      ];

      autoTable(doc, {
        startY: 90,
        head: [['Metric', 'Amount']],
        body: summary,
        theme: 'grid',
        styles: { fontSize: 10 },
        headStyles: { fillColor: [37, 99, 235] },
      });

      if (this.expenses().length > 0) {
        const finalY =
          (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 200;
        doc.setFontSize(12);
        doc.text('Expenses', 40, finalY + 28);
        autoTable(doc, {
          startY: finalY + 38,
          head: [['Date', 'Category', 'Description', 'Amount']],
          body: this.expenses().map((e) => [
            e.date,
            e.category ?? '—',
            e.description,
            `${sym}${Number(e.amount).toFixed(2)}`,
          ]),
          theme: 'striped',
          styles: { fontSize: 9 },
          headStyles: { fillColor: [37, 99, 235] },
        });
      }

      doc.save(`maxpos-report-${from}_to_${to}.pdf`);
    } catch (err) {
      console.warn('[reports] PDF export failed', err);
      this.snackBar.open('Could not generate the PDF.', 'Dismiss', { duration: 3000 });
    } finally {
      this.exporting.set(false);
    }
  }

  /**
   * Build a flat `string[][]` shape that both the CSV and XLSX exports
   * can consume without duplicating logic. First rows are the summary,
   * a blank separator, then the expenses detail.
   */
  private buildReportRows(): string[][] {
    const sym = this.currencySymbol();
    const rows: string[][] = [
      ['MaxPOS profit report'],
      ['From', toISODate(this.fromDate())],
      ['To', toISODate(this.toDate())],
      [],
      ['Metric', 'Amount'],
      ['Revenue', `${sym}${this.revenue().toFixed(2)}`],
      ['COGS', `${sym}${this.cogs().toFixed(2)}`],
      ['Gross profit', `${sym}${this.grossProfit().toFixed(2)}`],
      ['Gross margin %', `${this.grossMargin().toFixed(1)}%`],
      ['Expenses', `${sym}${this.totalExpenses().toFixed(2)}`],
      ['Net profit', `${sym}${this.netProfit().toFixed(2)}`],
      [],
      ['Expenses'],
      ['Date', 'Category', 'Description', 'Amount'],
    ];
    for (const e of this.expenses()) {
      rows.push([
        e.date,
        e.category ?? '',
        e.description,
        Number(e.amount).toFixed(2),
      ]);
    }
    return rows;
  }
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function rowsToCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function csvCell(value: string): string {
  if (value == null) return '';
  const needsQuote = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
