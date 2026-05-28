import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ClipboardModule } from '@angular/cdk/clipboard';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GcashTransaction } from '../../../core/models';
import { GcashService } from '../../../core/services/gcash.service';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';

/** Audit-only filter — cash-outs land COMPLETED on create, so the
 *  meaningful split here is "still active" vs "voided" vs "all". */
type VoidFilter = 'active' | 'voided' | 'all';

/**
 * Admin audit view for cash-out transactions. Unlike cash-ins,
 * cash-outs land COMPLETED at the till (the cashier verifies the
 * inbound GCash before handing cash), so there's no work queue.
 * What admins need here is to spot mistakes / disputed transactions
 * and void them. Voiding is soft — the row stays in history with
 * voided_at + voided_by set, and end-of-day aggregations exclude it.
 */
@Component({
  selector: 'app-gcash-cashouts-tab',
  imports: [
    ClipboardModule,
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gcash-cashouts.tab.html',
  styleUrl: './gcash-cashouts.tab.scss',
})
export class GcashCashoutsTab implements OnInit {
  private readonly gcashService = inject(GcashService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly txns = signal<readonly GcashTransaction[]>([]);
  protected readonly filter = signal<VoidFilter>('active');

  protected readonly columns = [
    'ref',
    'date',
    'inboundRef',
    'amount',
    'fee',
    'status',
    'actions',
  ] as const;

  protected readonly cashOuts = computed(() =>
    this.txns().filter((t) => t.type === 'CASH_OUT'),
  );

  protected readonly rows = computed(() => {
    const f = this.filter();
    return this.cashOuts().filter((t) => {
      if (f === 'all') return true;
      if (f === 'voided') return t.voidedAt !== null;
      return t.voidedAt === null;
    });
  });

  protected readonly activeCount = computed(
    () => this.cashOuts().filter((t) => t.voidedAt === null).length,
  );
  protected readonly voidedCount = computed(
    () => this.cashOuts().filter((t) => t.voidedAt !== null).length,
  );

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.gcashService.listAll().subscribe({
      next: (rows) => {
        this.txns.set(rows);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err.error?.message ?? 'Could not load cash-outs.');
        this.loading.set(false);
      },
    });
  }

  protected setFilter(f: VoidFilter): void {
    this.filter.set(f);
  }

  protected onRefCopied(success: boolean, ref: string | null): void {
    if (!ref) return;
    this.snackBar.open(
      success ? `Copied ${ref}` : 'Could not copy — clipboard blocked',
      'Dismiss',
      { duration: 2000 },
    );
  }

  /**
   * Void a cash-out. The cashier already handed cash at the till, so
   * voiding is for accounting / dispute resolution only — it
   * excludes the row from end-of-day aggregates but doesn't reverse
   * the till transaction. The confirm message spells that out so the
   * admin isn't surprised when the drawer count doesn't change.
   */
  protected confirmVoid(txn: GcashTransaction): void {
    const ref = this.dialog.open(ConfirmDialog, {
      width: '480px',
      data: {
        title: 'Void cash-out',
        message:
          `Void ${txn.reference}? This removes the transaction from end-of-day ` +
          `totals for accounting purposes. The cash already handed to the customer ` +
          `at the till stays out — voiding doesn't reverse that. Use this for ` +
          `mistakes (wrong amount, duplicate entry) or disputed transactions.`,
        confirmLabel: 'Void',
        destructive: true,
        icon: 'block',
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.gcashService.void(txn.id).subscribe({
        next: () => {
          this.snackBar.open(`Voided ${txn.reference}`, 'Dismiss', { duration: 2500 });
          this.load();
        },
        error: (err: HttpErrorResponse) => {
          this.snackBar.open(err.error?.message ?? 'Void failed.', 'Dismiss', {
            duration: 4000,
          });
        },
      });
    });
  }
}
