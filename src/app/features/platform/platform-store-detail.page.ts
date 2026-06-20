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
import { PlatformStore } from '../../core/models/platform.model';
import { AuthService } from '../../core/services/auth.service';
import { PlatformService } from '../../core/services/platform.service';
import { ConfirmDialog } from '../../shared/dialogs/confirm-dialog';
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
            <span class="stat__value">{{ s.revenue | number: '1.2-2' }}</span>
          </mat-card>
          <mat-card appearance="outlined" class="stat">
            <span class="stat__label">Last sale</span>
            <span class="stat__value stat__value--sm">
              {{ s.lastSaleAt ? (s.lastSaleAt | date: 'MMM d, y, h:mm a') : 'No sales yet' }}
            </span>
          </mat-card>
        </div>
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

  protected readonly store = signal<PlatformStore | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

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
