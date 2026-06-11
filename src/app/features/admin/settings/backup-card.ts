import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule } from '@angular/material/dialog';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { BackupService } from '../../../core/services/backup.service';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/dialogs/confirm-dialog';
import { downloadBlob } from '../../../shared/utils/download';

/**
 * Settings card: export the whole database to a JSON file and restore from one.
 *
 * Restore is a full replace (wipe + reload) gated behind a typed "RESTORE"
 * confirmation. Because it rewrites the users table, the current session's
 * token no longer maps to a known user afterwards, so we sign the admin out
 * and bounce them to /login on success.
 */
@Component({
  selector: 'app-backup-card',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './backup-card.html',
  styles: [
    `
      .backup {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        padding-top: 1rem;
      }
      .backup__row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .backup__text {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        max-width: 38rem;
      }
      .backup__text small {
        color: var(--mat-sys-on-surface-variant);
        line-height: 1.4;
      }
      .backup__warning {
        display: flex;
        align-items: flex-start;
        gap: 0.35rem;
        color: var(--mat-sys-error);
      }
      .backup__warning mat-icon {
        font-size: 1.1rem;
        height: 1.1rem;
        width: 1.1rem;
      }
    `,
  ],
})
export class BackupCard {
  private readonly backupService = inject(BackupService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly exporting = signal(false);
  protected readonly importing = signal(false);
  protected readonly busy = signal(false); // true while either op runs (disables both)

  protected exportDatabase(): void {
    if (this.busy()) return;
    this.exporting.set(true);
    this.busy.set(true);
    this.backupService.exportDatabase().subscribe({
      next: (blob) => {
        const today = new Date().toISOString().slice(0, 10);
        downloadBlob(blob, `maxpos-backup-${today}.json`);
        this.snackBar.open('Backup downloaded.', 'Dismiss', { duration: 2500 });
        this.exporting.set(false);
        this.busy.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.snackBar.open(this.describe(err, 'export'), 'Dismiss', { duration: 4000 });
        this.exporting.set(false);
        this.busy.set(false);
      },
    });
  }

  /** Hidden file input change handler. */
  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file later
    if (!file || this.busy()) return;

    // Read + sanity-check the file before the destructive confirm, so a wrong
    // file fails fast with a clear message instead of after "RESTORE".
    let text: string;
    try {
      text = await file.text();
      const parsed = JSON.parse(text) as { format?: unknown };
      if (parsed?.format !== 'maxpos-backup') {
        this.snackBar.open('That file isn’t a MaxPOS backup.', 'Dismiss', { duration: 4000 });
        return;
      }
    } catch {
      this.snackBar.open('Couldn’t read that file as JSON.', 'Dismiss', { duration: 4000 });
      return;
    }

    const data: ConfirmDialogData = {
      title: 'Restore database',
      message:
        `This replaces ALL current data with the contents of "${file.name}". ` +
        'This cannot be undone. You’ll be signed out and must log in again afterwards.',
      confirmLabel: 'Restore',
      destructive: true,
      icon: 'warning',
      requireText: 'RESTORE',
    };
    const confirmed = await firstValueFrom(
      this.dialog.open(ConfirmDialog, { width: '480px', data }).afterClosed(),
    );
    if (!confirmed) return;

    this.importing.set(true);
    this.busy.set(true);
    this.backupService.importDatabase(text).subscribe({
      next: (summary) => {
        this.snackBar.open(
          `Restored ${summary.rows} rows across ${summary.tables} tables. Please sign in again.`,
          'Dismiss',
          { duration: 5000 },
        );
        // The restored users table invalidates the current session — sign out
        // and send to login.
        this.authService.logout();
        void this.router.navigate(['/login']);
        this.importing.set(false);
        this.busy.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.snackBar.open(this.describe(err, 'restore'), 'Dismiss', { duration: 6000 });
        this.importing.set(false);
        this.busy.set(false);
      },
    });
  }

  private describe(err: HttpErrorResponse, op: 'export' | 'restore'): string {
    if (err.status === 0) return 'Cannot reach the server.';
    if (err.status === 403) return 'Only admins can back up or restore the database.';
    const apiMessage =
      err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message?: unknown }).message)
        : null;
    return apiMessage ?? `Could not ${op} the database.`;
  }
}
