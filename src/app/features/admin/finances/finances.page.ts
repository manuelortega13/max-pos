import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import {
  ACCOUNT_KIND_LABELS,
  Account,
  AccountMovement,
  AccountSummary,
  FinanceOverview,
  MOVEMENT_CATEGORY_LABELS,
} from '../../../core/models';
import { FinanceService } from '../../../core/services/finance.service';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';
import { AccountFormDialog, AccountFormDialogData } from './account-form-dialog';
import { RecordCashDialog, RecordCashDialogData } from './record-cash-dialog';
import { TransferDialog, TransferDialogData } from './transfer-dialog';

/**
 * Finances overview — top-of-the-funnel view of the business's
 * cash + e-wallet + bank balances. Each account is a card; tapping
 * a card opens the drill-in page (movements + reconcile).
 *
 * The headline pulls {@code net} (sum of active balances) and a
 * 30-day in/out total (transfers excluded). The activity strip
 * underneath is a slice of the most-recent movements across all
 * accounts so admins see the heartbeat at a glance.
 */
@Component({
  selector: 'app-finances-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatTooltipModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './finances.page.html',
  styleUrl: './finances.page.scss',
})
export class FinancesPage implements OnInit {
  private readonly financeService = inject(FinanceService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly overview = signal<FinanceOverview | null>(null);
  protected readonly accounts = signal<Account[]>([]);
  protected readonly recentMovements = signal<AccountMovement[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly kindLabels = ACCOUNT_KIND_LABELS;
  protected readonly categoryLabels = MOVEMENT_CATEGORY_LABELS;

  /** Visible accounts (active and inactive both shown — inactive
   *  carry a chip and faded balance to avoid surprise when admin
   *  toggles them back on). */
  protected readonly visibleAccounts = computed(() => this.overview()?.accounts ?? []);

  protected readonly recentDisplayed = computed(() => this.recentMovements().slice(0, 10));

  protected readonly recentCols = ['occurredAt', 'account', 'category', 'amount'] as const;

  ngOnInit(): void {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.financeService.overview().subscribe({
      next: (overview) => {
        this.overview.set(overview);
        // Drive dialogs (need full Account, not just summary).
        this.financeService.listAccounts().subscribe({
          next: (rows) => this.accounts.set(rows),
        });
        this.financeService.listMovements().subscribe({
          next: (rows) => this.recentMovements.set(rows),
          error: () => this.recentMovements.set([]),
        });
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Could not load finances.');
      },
    });
  }

  protected openRecordIn(): void {
    this.dialog
      .open<RecordCashDialog, RecordCashDialogData, AccountMovement>(RecordCashDialog, {
        data: { direction: 'IN', accounts: this.activeAccounts() },
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((res) => res && this.reload());
  }

  protected openRecordOut(): void {
    this.dialog
      .open<RecordCashDialog, RecordCashDialogData, AccountMovement>(RecordCashDialog, {
        data: { direction: 'OUT', accounts: this.activeAccounts() },
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((res) => res && this.reload());
  }

  protected openTransfer(): void {
    this.dialog
      .open<TransferDialog, TransferDialogData, AccountMovement[]>(TransferDialog, {
        data: { accounts: this.activeAccounts() },
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((res) => res && this.reload());
  }

  protected openNewAccount(): void {
    this.dialog
      .open<AccountFormDialog, AccountFormDialogData, Account>(AccountFormDialog, {
        data: { account: null },
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((res) => res && this.reload());
  }

  protected editAccount(summary: AccountSummary): void {
    const full = this.accounts().find((a) => a.id === summary.id);
    if (!full) return;
    this.dialog
      .open<AccountFormDialog, AccountFormDialogData, Account>(AccountFormDialog, {
        data: { account: full },
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((res) => res && this.reload());
  }

  protected goToAccount(id: string): void {
    this.router.navigate(['/admin/finances', id]);
  }

  protected categoryLabel(c: string): string {
    return this.categoryLabels[c] ?? c;
  }

  private activeAccounts(): Account[] {
    return this.accounts().filter((a) => a.active);
  }
}
