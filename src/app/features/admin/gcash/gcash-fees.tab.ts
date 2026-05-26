import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { GcashFeeTier } from '../../../core/models';
import { GcashService } from '../../../core/services/gcash.service';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';
import {
  GcashFeeFormData,
  GcashFeeFormDialog,
} from './gcash-fee-form-dialog';

/**
 * Admin CRUD for GCash fee tiers. The list is intentionally fetched
 * fresh on each visit (not cached in service state) so the table
 * always reflects the latest schedule the cashier UI is hitting.
 */
@Component({
  selector: 'app-gcash-fees-tab',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gcash-fees.tab.html',
  styleUrl: './gcash-fees.tab.scss',
})
export class GcashFeesTab implements OnInit {
  private readonly gcashService = inject(GcashService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly tiers = signal<readonly GcashFeeTier[]>([]);

  protected readonly columns = ['range', 'fee', 'status', 'actions'] as const;
  /** Active tiers, used by the form dialog for the overlap check. */
  protected readonly activeTiers = computed(() => this.tiers().filter((t) => t.active));

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.gcashService.listTiers().subscribe({
      next: (rows) => {
        this.tiers.set(rows);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err.error?.message ?? 'Could not load fee tiers.');
        this.loading.set(false);
      },
    });
  }

  protected openCreate(): void {
    const ref = this.dialog.open<GcashFeeFormDialog, GcashFeeFormData>(GcashFeeFormDialog, {
      width: '520px',
      maxWidth: '95vw',
      panelClass: 'dialog-fullscreen-mobile',
      data: { mode: 'create', otherActive: this.activeTiers() },
    });
    ref.afterClosed().subscribe((changed) => {
      if (changed) this.load();
    });
  }

  protected openEdit(tier: GcashFeeTier): void {
    const ref = this.dialog.open<GcashFeeFormDialog, GcashFeeFormData>(GcashFeeFormDialog, {
      width: '520px',
      maxWidth: '95vw',
      panelClass: 'dialog-fullscreen-mobile',
      data: {
        mode: 'edit',
        tier,
        otherActive: this.activeTiers().filter((t) => t.id !== tier.id),
      },
    });
    ref.afterClosed().subscribe((changed) => {
      if (changed) this.load();
    });
  }

  protected confirmDelete(tier: GcashFeeTier): void {
    const ref = this.dialog.open(ConfirmDialog, {
      width: '440px',
      data: {
        title: 'Delete fee tier',
        message: `Delete tier ${tier.minAmount}–${tier.maxAmount}? Past transactions are unaffected.`,
        confirmLabel: 'Delete',
        destructive: true,
        icon: 'delete_forever',
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.gcashService.deleteTier(tier.id).subscribe({
        next: () => {
          this.snackBar.open('Tier deleted', 'Dismiss', { duration: 2500 });
          this.load();
        },
        error: (err: HttpErrorResponse) => {
          this.snackBar.open(err.error?.message ?? 'Delete failed.', 'Dismiss', {
            duration: 4000,
          });
        },
      });
    });
  }
}
