import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { BackupFileInfo, BackupService } from '../../../core/services/backup.service';
import { SettingsService } from '../../../core/services/settings.service';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/dialogs/confirm-dialog';
import { downloadBlob } from '../../../shared/utils/download';

/**
 * Settings card: export the whole database to a JSON file, restore from one,
 * and toggle daily automatic backups.
 *
 * Restore is a full replace (wipe + reload) gated behind a typed "RESTORE"
 * confirmation; it rewrites the users table, so the current session is no
 * longer valid afterwards and we sign the admin out.
 *
 * Auto-backup is a store-wide setting: when on, the backend writes a daily
 * backup to disk (listed here for download) and this app downloads one to the
 * browser once a day.
 */
@Component({
  selector: 'app-backup-card',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
    MatSlideToggleModule,
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
      .backup__divider {
        border: none;
        border-top: 1px solid var(--mat-sys-outline-variant);
        margin: 0;
      }
      .backup__files {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .backup__file {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.35rem 0;
      }
      .backup__file-meta {
        color: var(--mat-sys-on-surface-variant);
        font-size: 0.85rem;
      }
      .backup__empty {
        color: var(--mat-sys-on-surface-variant);
        font-size: 0.85rem;
      }
    `,
  ],
})
export class BackupCard implements OnInit {
  private readonly backupService = inject(BackupService);
  private readonly settingsService = inject(SettingsService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly exporting = signal(false);
  protected readonly importing = signal(false);
  protected readonly busy = signal(false); // export/import in flight — disables both
  protected readonly savingToggle = signal(false);
  protected readonly backups = signal<BackupFileInfo[]>([]);

  /** Reflects the store-wide auto-backup setting. */
  protected readonly autoBackupEnabled = computed(
    () => this.settingsService.settings().autoBackupEnabled,
  );

  ngOnInit(): void {
    this.refreshFiles();
  }

  // ───────────────────────────── auto-backup ─────────────────────────────

  protected toggleAutoBackup(on: boolean): void {
    if (this.savingToggle()) return;
    this.savingToggle.set(true);
    // Save the full settings object with the flag flipped (PUT replaces the
    // row); other fields carry their current values unchanged.
    this.settingsService.save({ ...this.settingsService.settings(), autoBackupEnabled: on }).subscribe({
      next: () => {
        this.savingToggle.set(false);
        this.snackBar.open(
          on ? 'Daily auto-backup enabled.' : 'Daily auto-backup disabled.',
          'Dismiss',
          { duration: 2500 },
        );
      },
      error: (err: HttpErrorResponse) => {
        this.savingToggle.set(false);
        this.snackBar.open(
          err.error?.message ?? 'Could not update the auto-backup setting.',
          'Dismiss',
          { duration: 4000 },
        );
      },
    });
  }

  private refreshFiles(): void {
    this.backupService.listBackups().subscribe({
      next: (files) => this.backups.set(files),
      error: () => this.backups.set([]), // endpoint admin-only / dir missing — quiet
    });
  }

  protected downloadServerBackup(name: string): void {
    this.backupService.downloadBackupFile(name).subscribe({
      next: (blob) => downloadBlob(blob, name),
      error: (err: HttpErrorResponse) =>
        this.snackBar.open(this.describe(err, 'download'), 'Dismiss', { duration: 4000 }),
    });
  }

  protected formatSize(bytes: number): string {
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
  }

  // ─────────────────────────────── export ────────────────────────────────

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

  // ─────────────────────────────── restore ───────────────────────────────

  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file later
    if (!file || this.busy()) return;

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

  private describe(err: HttpErrorResponse, op: 'export' | 'restore' | 'download'): string {
    if (err.status === 0) return 'Cannot reach the server.';
    if (err.status === 403) return 'Only admins can back up or restore the database.';
    const apiMessage =
      err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message?: unknown }).message)
        : null;
    return apiMessage ?? `Could not ${op} the database.`;
  }
}
