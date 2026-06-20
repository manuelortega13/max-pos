import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PlatformStore } from '../../core/models/platform.model';
import { AuthService } from '../../core/services/auth.service';
import { PlatformAuthService } from '../../core/services/platform-auth.service';
import { PlatformService } from '../../core/services/platform.service';
import { ConfirmDialog } from '../../shared/dialogs/confirm-dialog';
import { StoreEditData, StoreEditDialog } from './store-edit-dialog';

@Component({
  selector: 'app-platform-dashboard-page',
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page__header">
        <div>
          <h1>Stores</h1>
          <p>{{ adminEmail() }} · platform console</p>
        </div>
        <button mat-stroked-button (click)="logout()">
          <mat-icon>logout</mat-icon>
          Sign out
        </button>
      </header>

      <div class="summary">
        <mat-card appearance="outlined" class="summary__card">
          <span class="summary__label">Stores</span>
          <span class="summary__value">{{ stores().length }}</span>
        </mat-card>
        <mat-card appearance="outlined" class="summary__card">
          <span class="summary__label">Active</span>
          <span class="summary__value">{{ activeCount() }}</span>
        </mat-card>
        <mat-card appearance="outlined" class="summary__card summary__card--warn">
          <span class="summary__label">Suspended</span>
          <span class="summary__value">{{ suspendedCount() }}</span>
        </mat-card>
      </div>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }
      @if (error(); as message) {
        <mat-card appearance="outlined" class="error-card">
          <mat-icon>error_outline</mat-icon>
          <span>{{ message }}</span>
          <button mat-stroked-button (click)="reload()">Retry</button>
        </mat-card>
      }

      <mat-card appearance="outlined">
        <div class="table-wrap">
          <table mat-table [dataSource]="stores()" class="w-full">
            <ng-container matColumnDef="store">
              <th mat-header-cell *matHeaderCellDef>Store</th>
              <td mat-cell *matCellDef="let s">
                <div class="cell-store">
                  <strong>{{ s.name }}</strong>
                  <small>/{{ s.slug }}</small>
                </div>
              </td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let s">
                <mat-chip
                  disableRipple
                  [class]="'chip chip--' + (s.status === 'ACTIVE' ? 'active' : 'suspended')"
                >
                  {{ s.status === 'ACTIVE' ? 'Active' : 'Suspended' }}
                </mat-chip>
              </td>
            </ng-container>
            <ng-container matColumnDef="users">
              <th mat-header-cell *matHeaderCellDef>Users</th>
              <td mat-cell *matCellDef="let s">{{ s.users }}</td>
            </ng-container>
            <ng-container matColumnDef="products">
              <th mat-header-cell *matHeaderCellDef>Products</th>
              <td mat-cell *matCellDef="let s">{{ s.products }}</td>
            </ng-container>
            <ng-container matColumnDef="sales">
              <th mat-header-cell *matHeaderCellDef>Sales</th>
              <td mat-cell *matCellDef="let s">{{ s.sales }}</td>
            </ng-container>
            <ng-container matColumnDef="revenue">
              <th mat-header-cell *matHeaderCellDef>Revenue</th>
              <td mat-cell *matCellDef="let s">{{ s.revenue | number: '1.2-2' }}</td>
            </ng-container>
            <ng-container matColumnDef="lastSale">
              <th mat-header-cell *matHeaderCellDef>Last sale</th>
              <td mat-cell *matCellDef="let s">
                {{ s.lastSaleAt ? (s.lastSaleAt | date: 'MMM d, y') : '—' }}
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let s">
                <button mat-icon-button [matMenuTriggerFor]="menu" aria-label="Store actions">
                  <mat-icon>more_vert</mat-icon>
                </button>
                <mat-menu #menu="matMenu">
                  <button mat-menu-item [disabled]="s.status !== 'ACTIVE'" (click)="openStore(s)">
                    <mat-icon>login</mat-icon>
                    <span>Open store</span>
                  </button>
                  <button mat-menu-item (click)="edit(s)">
                    <mat-icon>edit</mat-icon>
                    <span>Edit</span>
                  </button>
                  @if (s.status === 'ACTIVE') {
                    <button mat-menu-item (click)="setStatus(s, false)">
                      <mat-icon>block</mat-icon>
                      <span>Suspend</span>
                    </button>
                  } @else {
                    <button mat-menu-item (click)="setStatus(s, true)">
                      <mat-icon>check_circle</mat-icon>
                      <span>Activate</span>
                    </button>
                  }
                </mat-menu>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
            <tr *matNoDataRow>
              <td [attr.colspan]="columns.length" class="no-data">No stores registered yet.</td>
            </tr>
          </table>
        </div>
      </mat-card>
    </section>
  `,
  styles: [
    `
      .page {
        max-width: 1100px;
        margin: 0 auto;
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }
      .page__header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .page__header h1 {
        margin: 0;
        font-size: 1.6rem;
        font-weight: 600;
      }
      .page__header p {
        margin: 0.2rem 0 0;
        color: var(--mat-sys-on-surface-variant);
      }
      .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 1rem;
      }
      .summary__card {
        padding: 1rem 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .summary__label {
        font-size: 0.8rem;
        color: var(--mat-sys-on-surface-variant);
      }
      .summary__value {
        font-size: 1.5rem;
        font-weight: 600;
      }
      .summary__card--warn .summary__value {
        color: var(--mat-sys-error);
      }
      .table-wrap {
        overflow-x: auto;
      }
      .w-full {
        width: 100%;
      }
      .cell-store {
        display: flex;
        flex-direction: column;
      }
      .cell-store small {
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
      .chip--suspended {
        background: var(--mat-sys-error-container) !important;
        color: var(--mat-sys-error) !important;
      }
      .error-card {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem;
        border-color: var(--mat-sys-error) !important;
      }
      .error-card mat-icon {
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
export class PlatformDashboardPage {
  private readonly platform = inject(PlatformService);
  private readonly platformAuth = inject(PlatformAuthService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly stores = signal<PlatformStore[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly adminEmail = computed(() => this.platformAuth.admin()?.email ?? '');
  protected readonly activeCount = computed(
    () => this.stores().filter((s) => s.status === 'ACTIVE').length,
  );
  protected readonly suspendedCount = computed(
    () => this.stores().filter((s) => s.status === 'SUSPENDED').length,
  );

  protected readonly columns = [
    'store',
    'status',
    'users',
    'products',
    'sales',
    'revenue',
    'lastSale',
    'actions',
  ] as const;

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.platform.listStores().subscribe({
      next: (list) => {
        this.stores.set(list);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Could not load stores.');
      },
    });
  }

  protected logout(): void {
    this.platformAuth.logout();
    void this.router.navigateByUrl('/platform/login');
  }

  private replace(updated: PlatformStore): void {
    this.stores.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
  }

  protected setStatus(store: PlatformStore, activate: boolean): void {
    const op = activate ? this.platform.activate(store.id) : this.platform.suspend(store.id);
    op.subscribe({
      next: (updated) => {
        this.replace(updated);
        this.snackBar.open(activate ? 'Store activated.' : 'Store suspended.', 'Dismiss', {
          duration: 2500,
        });
      },
      error: (err: HttpErrorResponse) =>
        this.snackBar.open(err.error?.message ?? 'Action failed.', 'Dismiss', { duration: 4000 }),
    });
  }

  protected edit(store: PlatformStore): void {
    const ref = this.dialog.open<StoreEditDialog, StoreEditData, StoreEditData>(StoreEditDialog, {
      width: '420px',
      data: { name: store.name, slug: store.slug },
    });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.platform.updateStore(store.id, result).subscribe({
        next: (updated) => {
          this.replace(updated);
          this.snackBar.open('Store updated.', 'Dismiss', { duration: 2500 });
        },
        error: (err: HttpErrorResponse) =>
          this.snackBar.open(err.error?.message ?? 'Update failed.', 'Dismiss', { duration: 4000 }),
      });
    });
  }

  /** Impersonate: adopt the store token as the current store session and
   *  jump into that store's admin. The platform session is preserved. */
  protected openStore(store: PlatformStore): void {
    const ref = this.dialog.open(ConfirmDialog, {
      width: '460px',
      data: {
        title: 'Open store',
        message: `Open "${store.name}" as its admin? You'll act inside this store until you sign out of it.`,
        confirmLabel: 'Open store',
        icon: 'login',
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.platform.impersonate(store.id).subscribe({
        next: (res) => {
          if (this.auth.adoptToken(res.token)) {
            void this.router.navigateByUrl('/admin/dashboard');
          } else {
            this.snackBar.open('Could not open the store session.', 'Dismiss', { duration: 4000 });
          }
        },
        error: (err: HttpErrorResponse) =>
          this.snackBar.open(err.error?.message ?? 'Could not open store.', 'Dismiss', {
            duration: 4000,
          }),
      });
    });
  }
}
