import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { PlatformStore, StoreUser } from '../../core/models/platform.model';
import { AuthService } from '../../core/services/auth.service';
import { PlatformService } from '../../core/services/platform.service';
import { PlatformSettingsService } from '../../core/services/platform-settings.service';
import { ConfirmDialog } from '../../shared/dialogs/confirm-dialog';
import { PlanAssignData, PlanAssignDialog } from './plan-assign-dialog';
import { StoreEditData, StoreEditDialog } from './store-edit-dialog';

@Component({
  selector: 'app-platform-store-detail-page',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="wrap">
      <a routerLink="/platform/stores" class="back"><mat-icon>arrow_back</mat-icon> All stores</a>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }
      @if (error(); as message) {
        <mat-card appearance="outlined" class="err">
          <mat-icon>error_outline</mat-icon><span>{{ message }}</span>
          <button mat-stroked-button (click)="reload()">Retry</button>
        </mat-card>
      }

      @if (store(); as s) {
        <header class="head">
          <div>
            <h1>{{ s.name }}</h1>
            <p>
              /{{ s.slug }} · created {{ s.createdAt | date: 'mediumDate' }}
              <mat-chip
                disableRipple
                [class]="'chip chip--' + (s.status === 'ACTIVE' ? 'active' : 'suspended')"
              >
                {{ s.status === 'ACTIVE' ? 'Active' : 'Suspended' }}
              </mat-chip>
            </p>
          </div>
          <div class="actions">
            <button mat-stroked-button [disabled]="s.status !== 'ACTIVE'" (click)="openStore(s)">
              <mat-icon>login</mat-icon> Open store
            </button>
            <button mat-stroked-button (click)="edit(s)"><mat-icon>edit</mat-icon> Edit</button>
            @if (s.status === 'ACTIVE') {
              <button mat-flat-button color="warn" (click)="setStatus(s, false)">
                <mat-icon>block</mat-icon> Suspend
              </button>
            } @else {
              <button mat-flat-button color="primary" (click)="setStatus(s, true)">
                <mat-icon>check_circle</mat-icon> Activate
              </button>
            }
          </div>
        </header>

        <div class="stats">
          <mat-card appearance="outlined" class="stat">
            <span class="stat__label">Users</span><span class="stat__value">{{ s.users }}</span>
          </mat-card>
          <mat-card appearance="outlined" class="stat">
            <span class="stat__label">Products</span
            ><span class="stat__value">{{ s.products }}</span>
          </mat-card>
          <mat-card appearance="outlined" class="stat">
            <span class="stat__label">Completed sales</span
            ><span class="stat__value">{{ s.sales }}</span>
          </mat-card>
          <mat-card appearance="outlined" class="stat">
            <span class="stat__label">Revenue</span>
            <span class="stat__value">{{ currencySymbol() }}{{ s.revenue | number: '1.2-2' }}</span>
          </mat-card>
          <mat-card appearance="outlined" class="stat">
            <span class="stat__label">Last sale</span>
            <span class="stat__value stat__value--sm">
              {{ s.lastSaleAt ? (s.lastSaleAt | date: 'MMM d, y, h:mm a') : 'No sales yet' }}
            </span>
          </mat-card>
        </div>

        <mat-card appearance="outlined" class="plan-card">
          <div class="plan-card__head">
            <div>
              <span class="stat__label">Subscription</span>
              <div class="plan-name">
                <mat-icon>workspace_premium</mat-icon>
                <strong>{{ s.planName ?? 'No plan' }}</strong>
              </div>
            </div>
            <button mat-stroked-button (click)="changePlan(s)">
              <mat-icon>tune</mat-icon> Change plan
            </button>
          </div>

          <div class="usage">
            <div class="usage__row">
              <div class="usage__top">
                <span>Users</span>
                <span class="usage__count">
                  {{ s.users }}{{ s.maxUsers === null ? '' : ' / ' + s.maxUsers }}
                </span>
              </div>
              @if (s.maxUsers === null) {
                <span class="usage__unlimited">Unlimited</span>
              } @else {
                <mat-progress-bar
                  mode="determinate"
                  [value]="pct(s.users, s.maxUsers)"
                  [class.over]="s.users > s.maxUsers"
                ></mat-progress-bar>
              }
            </div>
            <div class="usage__row">
              <div class="usage__top">
                <span>Products</span>
                <span class="usage__count">
                  {{ s.products }}{{ s.maxProducts === null ? '' : ' / ' + s.maxProducts }}
                </span>
              </div>
              @if (s.maxProducts === null) {
                <span class="usage__unlimited">Unlimited</span>
              } @else {
                <mat-progress-bar
                  mode="determinate"
                  [value]="pct(s.products, s.maxProducts)"
                  [class.over]="s.products > s.maxProducts"
                ></mat-progress-bar>
              }
            </div>
          </div>
        </mat-card>

        <mat-card appearance="outlined" class="table-card">
          <div class="users-head">
            <span class="stat__label">Users in this store</span>
          </div>
          <div class="table-wrap">
            <table mat-table [dataSource]="users()" class="w-full">
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>Name</th>
                <td mat-cell *matCellDef="let u">
                  <div class="ucell">
                    <strong>{{ u.name }}</strong>
                    <small>{{ u.email }}</small>
                  </div>
                </td>
              </ng-container>
              <ng-container matColumnDef="role">
                <th mat-header-cell *matHeaderCellDef>Role</th>
                <td mat-cell *matCellDef="let u">{{ u.role }}</td>
              </ng-container>
              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>Status</th>
                <td mat-cell *matCellDef="let u">
                  <mat-chip disableRipple [class]="'chip chip--' + (u.active ? 'active' : 'off')">
                    {{ u.active ? 'Active' : 'Disabled' }}
                  </mat-chip>
                </td>
              </ng-container>
              <ng-container matColumnDef="created">
                <th mat-header-cell *matHeaderCellDef>Added</th>
                <td mat-cell *matCellDef="let u">{{ u.createdAt | date: 'mediumDate' }}</td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="userColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: userColumns"></tr>
              <tr *matNoDataRow>
                <td [attr.colspan]="userColumns.length" class="no-data">No users.</td>
              </tr>
            </table>
          </div>
        </mat-card>
      }
    </section>
  `,
  styles: [
    `
      .wrap {
        max-width: 900px;
        margin: 0 auto;
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }
      .back {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        color: var(--mat-sys-on-surface-variant);
        text-decoration: none;
        font-size: 0.9rem;
      }
      .back mat-icon {
        font-size: 1.1rem;
        width: 1.1rem;
        height: 1.1rem;
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .head h1 {
        margin: 0;
        font-size: 1.6rem;
        font-weight: 600;
      }
      .head p {
        margin: 0.3rem 0 0;
        color: var(--mat-sys-on-surface-variant);
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 1rem;
      }
      .stat {
        padding: 1rem 1.1rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .stat__label {
        font-size: 0.8rem;
        color: var(--mat-sys-on-surface-variant);
      }
      .stat__value {
        font-size: 1.4rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .stat__value--sm {
        font-size: 1rem;
        font-weight: 500;
      }
      .plan-card {
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }
      .plan-card__head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .plan-name {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin-top: 0.2rem;
        font-size: 1.2rem;
      }
      .plan-name mat-icon {
        color: var(--mat-sys-primary);
      }
      .usage {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .usage__top {
        display: flex;
        justify-content: space-between;
        margin-bottom: 0.35rem;
      }
      .usage__count {
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      .usage__unlimited {
        font-size: 0.85rem;
        color: var(--mat-sys-on-surface-variant);
      }
      .usage mat-progress-bar.over {
        --mat-sys-primary: var(--mat-sys-error);
      }
      .table-card {
        overflow: hidden;
        padding: 0;
      }
      .users-head {
        padding: 1rem 1.1rem 0;
      }
      .table-wrap {
        overflow-x: auto;
      }
      .w-full {
        width: 100%;
      }
      .ucell {
        display: flex;
        flex-direction: column;
      }
      .ucell small {
        color: var(--mat-sys-on-surface-variant);
      }
      .chip--off {
        background: var(--mat-sys-surface-container-high) !important;
        color: var(--mat-sys-on-surface-variant) !important;
      }
      .no-data {
        padding: 1.5rem;
        text-align: center;
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
    `,
  ],
})
export class PlatformStoreDetailPage {
  /** Route param (component input binding is enabled in app config). */
  readonly id = input.required<string>();

  private readonly platform = inject(PlatformService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly currencySymbol = inject(PlatformSettingsService).currencySymbol;

  protected readonly store = signal<PlatformStore | null>(null);
  protected readonly users = signal<StoreUser[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly userColumns = ['name', 'role', 'status', 'created'] as const;

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.platform.getStore(this.id()).subscribe({
      next: (s) => {
        this.store.set(s);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(
          err.status === 404 ? 'Store not found.' : (err.error?.message ?? 'Could not load store.'),
        );
      },
    });
    this.platform.listStoreUsers(this.id()).subscribe({
      next: (list) => this.users.set(list),
      // Non-fatal: the store card still renders; users table just stays empty.
      error: () => this.users.set([]),
    });
  }

  /** Usage as a 0–100 percentage of the limit, clamped for the progress bar. */
  protected pct(used: number, max: number): number {
    if (max <= 0) return 100;
    return Math.min(100, Math.round((used / max) * 100));
  }

  protected changePlan(store: PlatformStore): void {
    this.platform.listPlans().subscribe({
      next: (plans) => {
        const ref = this.dialog.open<PlanAssignDialog, PlanAssignData, { planId: string | null }>(
          PlanAssignDialog,
          { width: '420px', data: { plans, currentPlanId: store.planId } },
        );
        ref.afterClosed().subscribe((result) => {
          if (!result) return;
          this.platform.assignPlan(store.id, result.planId).subscribe({
            next: (updated) => {
              this.store.set(updated);
              this.snackBar.open('Plan updated.', 'Dismiss', { duration: 2500 });
            },
            error: (err: HttpErrorResponse) =>
              this.snackBar.open(err.error?.message ?? 'Could not update plan.', 'Dismiss', {
                duration: 4000,
              }),
          });
        });
      },
      error: (err: HttpErrorResponse) =>
        this.snackBar.open(err.error?.message ?? 'Could not load plans.', 'Dismiss', {
          duration: 4000,
        }),
    });
  }

  protected setStatus(store: PlatformStore, activate: boolean): void {
    const op = activate ? this.platform.activate(store.id) : this.platform.suspend(store.id);
    op.subscribe({
      next: (updated) => {
        this.store.set(updated);
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
          this.store.set(updated);
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
