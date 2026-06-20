import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { PlatformAdminAccount } from '../../core/models/platform.model';
import { PlatformService } from '../../core/services/platform.service';
import { AdminCreateDialog } from './admin-create-dialog';

@Component({
  selector: 'app-platform-admins-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTableModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="wrap">
      <header class="head">
        <div>
          <h1>Platform admins</h1>
          <p>Accounts that can manage the platform</p>
        </div>
        <button mat-flat-button color="primary" (click)="add()">
          <mat-icon>person_add</mat-icon>
          Add admin
        </button>
      </header>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }
      @if (error(); as message) {
        <mat-card appearance="outlined" class="err">
          <mat-icon>error_outline</mat-icon><span>{{ message }}</span>
          <button mat-stroked-button (click)="reload()">Retry</button>
        </mat-card>
      }

      <mat-card appearance="outlined" class="table-card">
        <div class="table-wrap">
          <table mat-table [dataSource]="admins()" class="w-full">
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>Name</th>
              <td mat-cell *matCellDef="let a">
                <div class="cell">
                  <strong>{{ a.name }}</strong>
                  <small>{{ a.email }}</small>
                </div>
              </td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let a">
                <mat-chip disableRipple [class]="'chip chip--' + (a.active ? 'active' : 'off')">
                  {{ a.active ? 'Active' : 'Disabled' }}
                </mat-chip>
              </td>
            </ng-container>
            <ng-container matColumnDef="created">
              <th mat-header-cell *matHeaderCellDef>Added</th>
              <td mat-cell *matCellDef="let a">{{ a.createdAt | date: 'mediumDate' }}</td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let a">
                <button mat-icon-button [matMenuTriggerFor]="menu" aria-label="Admin actions">
                  <mat-icon>more_vert</mat-icon>
                </button>
                <mat-menu #menu="matMenu">
                  @if (a.active) {
                    <button mat-menu-item (click)="setActive(a, false)">
                      <mat-icon>block</mat-icon><span>Disable</span>
                    </button>
                  } @else {
                    <button mat-menu-item (click)="setActive(a, true)">
                      <mat-icon>check_circle</mat-icon><span>Enable</span>
                    </button>
                  }
                </mat-menu>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
            <tr *matNoDataRow>
              <td [attr.colspan]="columns.length" class="no-data">No platform admins.</td>
            </tr>
          </table>
        </div>
      </mat-card>
    </section>
  `,
  styles: [
    `
      .wrap {
        max-width: 800px;
        margin: 0 auto;
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .head h1 {
        margin: 0;
        font-size: 1.6rem;
        font-weight: 600;
      }
      .head p {
        margin: 0.2rem 0 0;
        color: var(--mat-sys-on-surface-variant);
      }
      .table-card {
        overflow: hidden;
      }
      .table-wrap {
        overflow-x: auto;
      }
      .w-full {
        width: 100%;
      }
      .cell {
        display: flex;
        flex-direction: column;
      }
      .cell small {
        color: var(--mat-sys-on-surface-variant);
      }
      .chip {
        font-size: 0.75rem;
        font-weight: 500;
      }
      .chip--active {
        background: var(--color-success-container, #dcfce7) !important;
        color: var(--color-success, #047857) !important;
      }
      .chip--off {
        background: var(--mat-sys-surface-container-high) !important;
        color: var(--mat-sys-on-surface-variant) !important;
      }
      .err {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem;
        border-color: var(--mat-sys-error) !important;
      }
      .err mat-icon {
        color: var(--mat-sys-error);
      }
      .no-data {
        padding: 2rem;
        text-align: center;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class PlatformAdminsPage {
  private readonly platform = inject(PlatformService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly admins = signal<PlatformAdminAccount[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly columns = ['name', 'status', 'created', 'actions'] as const;

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.platform.listAdmins().subscribe({
      next: (list) => {
        this.admins.set(list);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Could not load admins.');
      },
    });
  }

  protected setActive(admin: PlatformAdminAccount, active: boolean): void {
    this.platform.setAdminActive(admin.id, active).subscribe({
      next: () => {
        this.snackBar.open(active ? 'Admin enabled.' : 'Admin disabled.', 'Dismiss', {
          duration: 2500,
        });
        this.reload();
      },
      error: (err: HttpErrorResponse) =>
        this.snackBar.open(err.error?.message ?? 'Could not update admin.', 'Dismiss', {
          duration: 4000,
        }),
    });
  }

  protected add(): void {
    const ref = this.dialog.open(AdminCreateDialog, { width: '420px' });
    ref.afterClosed().subscribe((payload) => {
      if (!payload) return;
      this.platform.createAdmin(payload).subscribe({
        next: () => {
          this.snackBar.open('Platform admin added.', 'Dismiss', { duration: 2500 });
          this.reload();
        },
        error: (err: HttpErrorResponse) =>
          this.snackBar.open(err.error?.message ?? 'Could not add admin.', 'Dismiss', {
            duration: 4000,
          }),
      });
    });
  }
}
