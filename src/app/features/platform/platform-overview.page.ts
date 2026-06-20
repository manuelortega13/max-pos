import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { PlatformStore } from '../../core/models/platform.model';
import { PlatformService } from '../../core/services/platform.service';
import { PlatformSettingsService } from '../../core/services/platform-settings.service';

@Component({
  selector: 'app-platform-overview-page',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="wrap">
      <header class="head">
        <h1>Overview</h1>
        <p>Platform-wide activity across all stores</p>
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

      <div class="kpis">
        <mat-card appearance="outlined" class="kpi">
          <div class="kpi__icon kpi__icon--a"><mat-icon>storefront</mat-icon></div>
          <div>
            <span class="kpi__label">Stores</span><span class="kpi__value">{{ total() }}</span>
          </div>
        </mat-card>
        <mat-card appearance="outlined" class="kpi">
          <div class="kpi__icon kpi__icon--ok"><mat-icon>check_circle</mat-icon></div>
          <div>
            <span class="kpi__label">Active</span><span class="kpi__value">{{ active() }}</span>
          </div>
        </mat-card>
        <mat-card appearance="outlined" class="kpi">
          <div class="kpi__icon kpi__icon--warn"><mat-icon>block</mat-icon></div>
          <div>
            <span class="kpi__label">Suspended</span
            ><span class="kpi__value">{{ suspended() }}</span>
          </div>
        </mat-card>
        <mat-card appearance="outlined" class="kpi">
          <div class="kpi__icon kpi__icon--n"><mat-icon>group</mat-icon></div>
          <div>
            <span class="kpi__label">Users</span><span class="kpi__value">{{ users() }}</span>
          </div>
        </mat-card>
        <mat-card appearance="outlined" class="kpi">
          <div class="kpi__icon kpi__icon--n"><mat-icon>inventory_2</mat-icon></div>
          <div>
            <span class="kpi__label">Products</span><span class="kpi__value">{{ products() }}</span>
          </div>
        </mat-card>
        <mat-card appearance="outlined" class="kpi">
          <div class="kpi__icon kpi__icon--n"><mat-icon>receipt_long</mat-icon></div>
          <div>
            <span class="kpi__label">Completed sales</span
            ><span class="kpi__value">{{ sales() }}</span>
          </div>
        </mat-card>
        <mat-card appearance="outlined" class="kpi kpi--wide">
          <div class="kpi__icon kpi__icon--a"><mat-icon>payments</mat-icon></div>
          <div>
            <span class="kpi__label">Total revenue (all stores)</span>
            <span class="kpi__value">{{ currencySymbol() }}{{ revenue() | number: '1.2-2' }}</span>
            <span class="kpi__hint">Sums each store's revenue across currencies</span>
          </div>
        </mat-card>
      </div>

      <mat-card appearance="outlined" class="recent">
        <mat-card-header>
          <mat-card-title>Newest stores</mat-card-title>
          <mat-card-subtitle>Most recently registered</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (newest().length === 0) {
            <p class="muted">No stores yet.</p>
          } @else {
            <ul class="list">
              @for (s of newest(); track s.id) {
                <li>
                  <a [routerLink]="['/platform/stores', s.id]" class="list__name">{{ s.name }}</a>
                  <small class="muted"
                    >/{{ s.slug }} · {{ s.createdAt | date: 'mediumDate' }}</small
                  >
                </li>
              }
            </ul>
          }
        </mat-card-content>
        <mat-card-actions align="end">
          <a mat-button routerLink="/platform/stores">All stores →</a>
        </mat-card-actions>
      </mat-card>
    </section>
  `,
  styles: [
    `
      .wrap {
        max-width: 1000px;
        margin: 0 auto;
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
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
      .kpis {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 1rem;
      }
      .kpi {
        display: flex;
        align-items: center;
        gap: 0.85rem;
        padding: 1rem 1.1rem;
      }
      .kpi--wide {
        grid-column: 1 / -1;
      }
      .kpi__icon {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 0.6rem;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        flex-shrink: 0;
      }
      .kpi__icon--a {
        background: var(--mat-sys-primary);
      }
      .kpi__icon--ok {
        background: #10b981;
      }
      .kpi__icon--warn {
        background: var(--mat-sys-error);
      }
      .kpi__icon--n {
        background: #64748b;
      }
      .kpi div:last-child {
        display: flex;
        flex-direction: column;
      }
      .kpi__label {
        font-size: 0.8rem;
        color: var(--mat-sys-on-surface-variant);
      }
      .kpi__value {
        font-size: 1.4rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .kpi__hint {
        font-size: 0.7rem;
        color: var(--mat-sys-on-surface-variant);
      }
      .list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
      }
      .list li {
        display: flex;
        flex-direction: column;
      }
      .list__name {
        font-weight: 600;
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
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
export class PlatformOverviewPage {
  private readonly platform = inject(PlatformService);
  protected readonly currencySymbol = inject(PlatformSettingsService).currencySymbol;

  private readonly stores = signal<PlatformStore[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly total = computed(() => this.stores().length);
  protected readonly active = computed(
    () => this.stores().filter((s) => s.status === 'ACTIVE').length,
  );
  protected readonly suspended = computed(
    () => this.stores().filter((s) => s.status === 'SUSPENDED').length,
  );
  protected readonly users = computed(() => this.sum((s) => s.users));
  protected readonly products = computed(() => this.sum((s) => s.products));
  protected readonly sales = computed(() => this.sum((s) => s.sales));
  protected readonly revenue = computed(() => this.sum((s) => s.revenue));
  protected readonly newest = computed(() =>
    [...this.stores()]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 5),
  );

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
        this.error.set(err.error?.message ?? 'Could not load platform data.');
      },
    });
  }

  private sum(pick: (s: PlatformStore) => number): number {
    return this.stores().reduce((acc, s) => acc + (pick(s) || 0), 0);
  }
}
