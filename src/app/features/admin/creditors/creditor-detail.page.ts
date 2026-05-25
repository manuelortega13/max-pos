import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, TitleCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin } from 'rxjs';
import { Creditor, CreditorPayment, PAYMENT_TERM_LABEL, PaymentTerm, Sale } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { CreditorPaymentService } from '../../../core/services/creditor-payment.service';
import { CreditorService } from '../../../core/services/creditor.service';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { SaleItemsDialog } from '../../../shared/dialogs/sale-items-dialog';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

/**
 * Per-creditor detail + purchase history. Replaces the previous
 * dialog-based view — a dedicated page survives reloads, supports
 * deep-linking, and gives the sales table room to breathe even with
 * a long history.
 *
 * Drills further into individual sales via the existing
 * SaleItemsDialog so a manager can go from "what do they owe?" →
 * "which sales?" → "which items in this sale?" in two clicks.
 */
@Component({
  selector: 'app-creditor-detail-page',
  imports: [
    DatePipe,
    RouterLink,
    TitleCasePipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatTooltipModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './creditor-detail.page.html',
  styleUrl: './creditor-detail.page.scss',
})
export class CreditorDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly creditorService = inject(CreditorService);
  private readonly paymentService = inject(CreditorPaymentService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly authService = inject(AuthService);

  protected readonly creditor = signal<Creditor | null>(null);
  protected readonly sales = signal<Sale[]>([]);
  protected readonly payments = signal<CreditorPayment[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);

  protected readonly isAdmin = this.authService.isAdmin;
  protected readonly totalCount = computed(() => this.sales().length);
  protected readonly overLimit = computed(() => {
    const c = this.creditor();
    return c?.creditLimit != null && c.outstandingBalance > c.creditLimit;
  });
  /** Lifetime paid — sum of non-voided payment amounts. */
  protected readonly lifetimePaid = computed(() =>
    this.payments()
      .filter((p) => p.voidedAt === null)
      .reduce((sum, p) => sum + p.amount, 0),
  );

  protected readonly columns = ['ref', 'date', 'items', 'total', 'status'] as const;
  protected readonly paymentColumns = [
    'ref',
    'date',
    'amount',
    'method',
    'cashier',
    'actions',
  ] as const;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      void this.router.navigate(['/admin/creditors']);
      return;
    }
    // Parallel fetch so the page mounts once, ready. forkJoin emits
    // both together; either failing fails the whole thing and
    // surfaces the message in the error card below.
    forkJoin({
      creditor: this.creditorService.get(id),
      sales: this.creditorService.listSales(id),
      payments: this.paymentService.listByCreditor(id),
    }).subscribe({
      next: ({ creditor, sales, payments }) => {
        this.creditor.set(creditor);
        this.sales.set(sales);
        this.payments.set(payments);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(
          err.status === 404
            ? 'Creditor not found.'
            : err.error?.message ?? 'Could not load creditor.',
        );
        this.loading.set(false);
      },
    });
  }

  protected termLabel(term: PaymentTerm): string {
    return PAYMENT_TERM_LABEL[term];
  }

  protected openItems(sale: Sale): void {
    this.dialog.open(SaleItemsDialog, {
      width: '560px',
      maxWidth: '95vw',
      panelClass: ['sale-items-panel', 'dialog-fullscreen-mobile'],
      autoFocus: false,
      data: sale,
    });
  }

  /** Admin-only — soft-voids a payment. Server adds an audit
   *  trail to the payment's notes; the @Formula on Creditor
   *  automatically restores the balance because voided payments
   *  drop out of the sum. */
  protected confirmVoid(payment: CreditorPayment): void {
    const ref = this.dialog.open(ConfirmDialog, {
      width: '440px',
      data: {
        title: 'Void payment',
        message:
          `Void ${payment.reference} (${payment.amount.toFixed(2)})? ` +
          `The creditor's outstanding balance will increase by this amount.`,
        confirmLabel: 'Void',
        destructive: true,
        icon: 'undo',
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.paymentService.void(payment.id).subscribe({
        next: (updated) => {
          this.payments.update((list) =>
            list.map((p) => (p.id === updated.id ? updated : p)),
          );
          // Refresh the creditor to pick up the recomputed balance.
          this.creditorService.get(payment.creditorId).subscribe({
            next: (c) => this.creditor.set(c),
            error: () => {},
          });
          this.snackBar.open(`Voided ${updated.reference}`, 'Dismiss', { duration: 2500 });
        },
        error: (err: HttpErrorResponse) => {
          this.snackBar.open(
            err.error?.message ?? 'Could not void payment.',
            'Dismiss',
            { duration: 4000 },
          );
        },
      });
    });
  }
}
