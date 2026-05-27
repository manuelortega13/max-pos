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
import { LoadFeeTier } from '../../../core/models';
import { LoadService } from '../../../core/services/load.service';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';
import {
  LoadFeeFormData,
  LoadFeeFormDialog,
} from './load-fee-form-dialog';

/**
 * Admin CRUD for load fee tiers. Same shape as the GCash fees tab —
 * fetched fresh on each visit to reflect the latest schedule the
 * cashier UI is hitting.
 */
@Component({
  selector: 'app-load-fees-tab',
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
  templateUrl: './load-fees.tab.html',
  styleUrl: './load-fees.tab.scss',
})
export class LoadFeesTab implements OnInit {
  private readonly loadService = inject(LoadService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly tiers = signal<readonly LoadFeeTier[]>([]);

  protected readonly columns = ['range', 'fee', 'status', 'actions'] as const;
  protected readonly activeTiers = computed(() => this.tiers().filter((t) => t.active));

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.loadService.listTiers().subscribe({
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
    const ref = this.dialog.open<LoadFeeFormDialog, LoadFeeFormData>(LoadFeeFormDialog, {
      width: '520px',
      maxWidth: '95vw',
      panelClass: 'dialog-fullscreen-mobile',
      data: { mode: 'create', otherActive: this.activeTiers() },
    });
    ref.afterClosed().subscribe((changed) => {
      if (changed) this.load();
    });
  }

  protected openEdit(tier: LoadFeeTier): void {
    const ref = this.dialog.open<LoadFeeFormDialog, LoadFeeFormData>(LoadFeeFormDialog, {
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

  protected confirmDelete(tier: LoadFeeTier): void {
    const ref = this.dialog.open(ConfirmDialog, {
      width: '440px',
      data: {
        title: 'Delete fee tier',
        message: `Delete tier ${tier.minAmount}–${tier.maxAmount}? Past loads are unaffected.`,
        confirmLabel: 'Delete',
        destructive: true,
        icon: 'delete_forever',
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.loadService.deleteTier(tier.id).subscribe({
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
