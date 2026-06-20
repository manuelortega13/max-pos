import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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
import { PlatformService } from '../../core/services/platform.service';
import { PlatformSettingsService } from '../../core/services/platform-settings.service';
import { ConfirmDialog } from '../../shared/dialogs/confirm-dialog';
import { StoreEditData, StoreEditDialog } from './store-edit-dialog';

@Component({
  selector: 'app-platform-stores-page',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
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
    <section class="wrap">
      <header class="head">
        <div>
          <h1>Stores</h1>
          <p>{{ stores().length }} registered · {{ activeCount() }} active</p>
        </div>
        <div class="head-actions">
          <button mat-stroked-button (click)="exportCsv()" [disabled]="!stores().length">
            <mat-icon>download</mat-icon>
            Export CSV
          </button>
          <button mat-stroked-button (click)="reload()" [disabled]="loading()">
            <mat-icon>refresh</mat-icon>
            Refresh
          </button>
        </div>
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
          <table mat-table [dataSource]="stores()" class="w-full">
            <ng-container matColumnDef="store">
              <th mat-header-cell *matHeaderCellDef>Store</th>
              <td mat-cell *matCellDef="let s">
                <a [routerLink]="['/platform/stores', s.id]" class="store-link">
                  <strong>{{ s.name }}</strong>
                  <small>/{{ s.slug }}</small>
                </a>
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
              <td mat-cell *matCellDef="let s">
                {{ currencySymbol() }}{{ s.revenue | number: '1.2-2' }}
              </td>
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
                  <a mat-menu-item [routerLink]="['/platform/stores', s.id]">
                    <mat-icon>visibility</mat-icon><span>View details</span>
                  </a>
                  <button mat-menu-item [disabled]="s.status !== 'ACTIVE'" (click)="openStore(s)">
                    <mat-icon>login</mat-icon><span>Open store</span>
                  </button>
                  <button mat-menu-item (click)="edit(s)">
                    <mat-icon>edit</mat-icon><span>Edit</span>
                  </button>
                  @if (s.status === 'ACTIVE') {
                    <button mat-menu-item (click)="setStatus(s, false)">
                      <mat-icon>block</mat-icon><span>Suspend</span>
                    </button>
                  } @else {
                    <button mat-menu-item (click)="setStatus(s, true)">
                      <mat-icon>check_circle</mat-icon><span>Activate</span>
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
      .wrap {
        max-width: 1100px;
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
      .head-actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      /* Clip the square-cornered table to the card's rounded corners so the
         header fill doesn't paint over the border arc (faded corners). */
      .table-card {
        overflow: hidden;
      }
      .table-wrap {
        overflow-x: auto;
      }
      .w-full {
        width: 100%;
      }
      .store-link {
        display: flex;
        flex-direction: column;
        color: inherit;
        text-decoration: none;
      }
      .store-link:hover strong {
        text-decoration: underline;
      }
      .store-link small {
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
export class PlatformStoresPage {
  private readonly platform = inject(PlatformService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly currencySymbol = inject(PlatformSettingsService).currencySymbol;

  protected readonly stores = signal<PlatformStore[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly activeCount = computed(
    () => this.stores().filter((s) => s.status === 'ACTIVE').length,
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

  private replace(updated: PlatformStore): void {
    this.stores.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
  }

  /** Download the current store list as a CSV (client-side, no backend call). */
  protected exportCsv(): void {
    const rows = this.stores();
    if (!rows.length) return;
    const headers = [
      'Name',
      'Slug',
      'Status',
      'Plan',
      'Users',
      'Products',
      'Sales',
      'Revenue',
      'Last sale',
      'Created',
    ];
    const cell = (v: string | number | null): string => {
      const s = v === null || v === undefined ? '' : String(v);
      // Quote and escape per RFC 4180 so commas/quotes/newlines stay intact.
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      headers.join(','),
      ...rows.map((s) =>
        [
          s.name,
          s.slug,
          s.status,
          s.planName ?? '',
          s.users,
          s.products,
          s.sales,
          s.revenue,
          s.lastSaleAt ?? '',
          s.createdAt,
        ]
          .map(cell)
          .join(','),
      ),
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stores.csv';
    a.click();
    URL.revokeObjectURL(url);
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
