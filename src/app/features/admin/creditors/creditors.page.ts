import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { Creditor, PAYMENT_TERM_LABEL, PaymentTerm } from '../../../core/models';
import { Router } from '@angular/router';
import { CreditorService } from '../../../core/services/creditor.service';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { MoneyPipe } from '../../../shared/pipes/currency-symbol.pipe';
import { CreditorFormDialog, CreditorFormData } from './creditor-form-dialog';

@Component({
  selector: 'app-creditors-page',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTableModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './creditors.page.html',
  styleUrl: './creditors.page.scss',
})
export class CreditorsPage implements OnInit {
  private readonly creditorService = inject(CreditorService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly loading = this.creditorService.loading;
  protected readonly error = this.creditorService.error;
  protected readonly search = signal('');
  /** Template helper — strict templates won't let us index a
   *  Record by `string`, so wrap the lookup as a method. */
  protected termLabel(term: PaymentTerm): string {
    return PAYMENT_TERM_LABEL[term];
  }

  protected readonly rows = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.creditorService.creditors().filter((c) => {
      if (!term) return true;
      return (
        c.fullName.toLowerCase().includes(term) ||
        c.phone.toLowerCase().includes(term) ||
        (c.address ?? '').toLowerCase().includes(term)
      );
    });
  });

  protected readonly columns = [
    'name',
    'phone',
    'term',
    'balance',
    'limit',
    'status',
    'actions',
  ] as const;

  ngOnInit(): void {
    this.creditorService.load();
  }

  protected retry(): void {
    this.creditorService.load();
  }

  protected openCreate(): void {
    this.dialog.open<CreditorFormDialog, CreditorFormData>(CreditorFormDialog, {
      width: '520px',
      maxWidth: '95vw',
      panelClass: 'dialog-fullscreen-mobile',
      autoFocus: 'first-tabbable',
      data: { mode: 'create' },
    });
  }

  protected openEdit(creditor: Creditor): void {
    this.dialog.open<CreditorFormDialog, CreditorFormData>(CreditorFormDialog, {
      width: '520px',
      maxWidth: '95vw',
      panelClass: 'dialog-fullscreen-mobile',
      autoFocus: 'first-tabbable',
      data: { mode: 'edit', creditor },
    });
  }

  protected viewSales(creditor: Creditor): void {
    void this.router.navigate(['/admin/creditors', creditor.id]);
  }

  protected confirmDelete(creditor: Creditor): void {
    const ref = this.dialog.open(ConfirmDialog, {
      width: '440px',
      data: {
        title: 'Delete creditor',
        message: `Delete "${creditor.fullName}"? This can't be undone.`,
        confirmLabel: 'Delete',
        destructive: true,
        icon: 'delete_forever',
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.creditorService.delete(creditor.id).subscribe({
        next: () =>
          this.snackBar.open(`Deleted ${creditor.fullName}`, 'Dismiss', { duration: 2500 }),
        error: (err: HttpErrorResponse) => {
          this.snackBar.open(
            err.error?.message ?? 'Delete failed.',
            'Dismiss',
            { duration: 4000 },
          );
        },
      });
    });
  }
}
