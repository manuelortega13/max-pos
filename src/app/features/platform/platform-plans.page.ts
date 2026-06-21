import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Plan } from '../../core/models/platform.model';
import { PlatformService } from '../../core/services/platform.service';
import { ConfirmDialog } from '../../shared/dialogs/confirm-dialog';
import { PlanFormData, PlanFormDialog } from './plan-form-dialog';

@Component({
  selector: 'app-platform-plans-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="wrap">
      <header class="head">
        <div>
          <h1>Plans</h1>
          <p>Subscription tiers stores can be assigned to</p>
        </div>
        <button mat-flat-button color="primary" (click)="add()">
          <mat-icon>add</mat-icon>
          Add plan
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

      <div class="grid">
        @for (p of plans(); track p.id) {
          <mat-card appearance="outlined" class="plan">
            <div class="plan__top">
              <h2>{{ p.name }}</h2>
              <mat-chip disableRipple class="code">{{ p.code }}</mat-chip>
              <button mat-icon-button [matMenuTriggerFor]="menu" aria-label="Plan actions">
                <mat-icon>more_vert</mat-icon>
              </button>
              <mat-menu #menu="matMenu">
                <button mat-menu-item (click)="edit(p)">
                  <mat-icon>edit</mat-icon><span>Edit</span>
                </button>
                <button
                  mat-menu-item
                  [disabled]="p.subscriberCount > 0"
                  [matTooltip]="
                    p.subscriberCount > 0
                      ? p.subscriberCount + ' store(s) subscribed — can\\'t delete'
                      : ''
                  "
                  matTooltipPosition="left"
                  (click)="remove(p)"
                >
                  <mat-icon>delete</mat-icon><span>Delete</span>
                </button>
              </mat-menu>
            </div>
            <p class="price">
              @if (p.priceCents === 0) {
                <span class="amount">Free</span>
              } @else {
                <span class="amount">{{ p.currencySymbol }}{{ amount(p.priceCents) }}</span>
                <span class="per">/mo</span>
              }
            </p>
            <ul class="limits">
              <li>
                <mat-icon>group</mat-icon>
                {{ p.maxUsers === null ? 'Unlimited users' : p.maxUsers + ' users' }}
              </li>
              <li>
                <mat-icon>inventory_2</mat-icon>
                {{ p.maxProducts === null ? 'Unlimited products' : p.maxProducts + ' products' }}
              </li>
              @if (p.trialDays > 0) {
                <li>
                  <mat-icon>schedule</mat-icon>
                  {{ p.trialDays }}-day free trial
                </li>
              }
              <li>
                <mat-icon>storefront</mat-icon>
                {{ p.subscriberCount }} subscriber{{ p.subscriberCount === 1 ? '' : 's' }}
              </li>
            </ul>
          </mat-card>
        } @empty {
          @if (!loading()) {
            <p class="no-data">No plans yet. Add one to get started.</p>
          }
        }
      </div>
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
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 1rem;
      }
      .plan {
        padding: 1.25rem;
      }
      .plan__top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .plan__top h2 {
        margin: 0;
        font-size: 1.2rem;
        font-weight: 600;
        flex: 1;
      }
      .code {
        font-size: 0.7rem !important;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .price {
        margin: 0.75rem 0 1rem;
      }
      .price .amount {
        font-size: 1.8rem;
        font-weight: 700;
      }
      .price .per {
        color: var(--mat-sys-on-surface-variant);
        margin-left: 0.2rem;
      }
      .limits {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .limits li {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--mat-sys-on-surface-variant);
      }
      .limits mat-icon {
        font-size: 1.15rem;
        width: 1.15rem;
        height: 1.15rem;
        color: var(--mat-sys-primary);
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
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class PlatformPlansPage {
  private readonly platform = inject(PlatformService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly plans = signal<Plan[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.platform.listPlans().subscribe({
      next: (list) => {
        this.plans.set(list);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Could not load plans.');
      },
    });
  }

  /** Price without symbol; the symbol comes from the plan (platform currency). */
  protected amount(cents: number): string {
    return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
  }

  protected add(): void {
    const ref = this.dialog.open<PlanFormDialog, PlanFormData>(PlanFormDialog, { width: '440px' });
    ref.afterClosed().subscribe((payload) => {
      if (!payload) return;
      this.platform.createPlan(payload).subscribe({
        next: () => {
          this.snackBar.open('Plan added.', 'Dismiss', { duration: 2500 });
          this.reload();
        },
        error: (err: HttpErrorResponse) =>
          this.snackBar.open(err.error?.message ?? 'Could not add plan.', 'Dismiss', {
            duration: 4000,
          }),
      });
    });
  }

  protected edit(plan: Plan): void {
    const ref = this.dialog.open<PlanFormDialog, PlanFormData>(PlanFormDialog, {
      width: '440px',
      data: { plan },
    });
    ref.afterClosed().subscribe((payload) => {
      if (!payload) return;
      this.platform.updatePlan(plan.id, payload).subscribe({
        next: () => {
          this.snackBar.open('Plan updated.', 'Dismiss', { duration: 2500 });
          this.reload();
        },
        error: (err: HttpErrorResponse) =>
          this.snackBar.open(err.error?.message ?? 'Could not update plan.', 'Dismiss', {
            duration: 4000,
          }),
      });
    });
  }

  protected remove(plan: Plan): void {
    if (plan.subscriberCount > 0) return; // also blocked server-side
    const ref = this.dialog.open<ConfirmDialog, { title: string; message: string }, boolean>(
      ConfirmDialog,
      {
        width: '420px',
        data: {
          title: 'Delete plan?',
          message: `Delete "${plan.name}"? This can't be undone.`,
        },
      },
    );
    ref.afterClosed().subscribe((ok) => {
      if (!ok) return;
      this.platform.deletePlan(plan.id).subscribe({
        next: () => {
          this.snackBar.open('Plan deleted.', 'Dismiss', { duration: 2500 });
          this.reload();
        },
        error: (err: HttpErrorResponse) =>
          this.snackBar.open(err.error?.message ?? 'Could not delete plan.', 'Dismiss', {
            duration: 4000,
          }),
      });
    });
  }
}
