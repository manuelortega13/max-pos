import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { StorePlan, StorePlans } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { SubscriptionService } from '../../core/services/subscription.service';

/**
 * Shown after sign-up (and to any store that hasn't picked a plan). The owner
 * chooses a trial or paid plan; the choice gates access to the admin console.
 * Plan prices are converted into the store's currency when it differs from the
 * platform currency, and the rate used is shown on each priced plan.
 */
@Component({
  selector: 'app-choose-plan-page',
  imports: [
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <header class="head">
        <h1>Choose your plan</h1>
        <p>Start with a free trial or subscribe to a paid plan to activate your store.</p>
        @if (data(); as d) {
          @if (d.storeCurrency) {
            <p class="cur-note">
              Your store currency is {{ d.storeCurrency }} ({{ d.storeSymbol }}). Plan prices are
              converted where a rate is available.
            </p>
          }
        }
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

      @if (data(); as d) {
        <div class="grid">
          @for (p of d.plans; track p.id) {
            <mat-card appearance="outlined" class="plan" [class.plan--trial]="p.trialDays > 0">
              <div class="plan__top">
                <h2>{{ p.name }}</h2>
                @if (p.trialDays > 0) {
                  <mat-chip disableRipple class="trial">{{ p.trialDays }}-day free trial</mat-chip>
                }
              </div>
              <p class="price">
                @if (p.trialDays > 0) {
                  <span class="amount">Free</span>
                  <span class="per">for {{ p.trialDays }} days</span>
                } @else if (p.priceCents === 0) {
                  <span class="amount">Free</span>
                } @else {
                  <span class="amount">{{ p.displaySymbol }}{{ amount(p.displayPriceCents) }}</span>
                  <span class="per">/mo</span>
                }
              </p>
              @if (p.priceCents > 0 && p.trialDays === 0 && p.converted) {
                <p class="fx">
                  {{ p.currencySymbol }}{{ amount(p.priceCents) }} {{ p.currency }} · 1
                  {{ p.currency }} = {{ p.displaySymbol }}{{ p.rate | number: '1.2-4' }}
                </p>
              }
              <ul class="limits">
                <li>
                  <mat-icon>group</mat-icon>
                  {{ p.maxUsers === null ? 'Unlimited users' : p.maxUsers + ' users' }}
                </li>
                <li>
                  <mat-icon>inventory_2</mat-icon>
                  {{ p.maxProducts === null ? 'Unlimited products' : p.maxProducts + ' products' }}
                </li>
              </ul>
              <button
                mat-flat-button
                color="primary"
                class="cta"
                [disabled]="submitting()"
                (click)="choose(p)"
              >
                {{ p.trialDays > 0 ? 'Start free trial' : 'Subscribe' }}
              </button>
            </mat-card>
          }
        </div>
      }

      <button mat-button class="signout" (click)="signOut()">
        <mat-icon>logout</mat-icon> Sign out
      </button>
    </div>
  `,
  styles: [
    `
      .wrap {
        min-height: 100vh;
        max-width: 920px;
        margin: 0 auto;
        padding: 2rem 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        background: var(--mat-sys-surface-container-low);
      }
      .head {
        text-align: center;
      }
      .head h1 {
        margin: 0;
        font-size: 1.6rem;
        font-weight: 600;
      }
      .head p {
        margin: 0.4rem 0 0;
        color: var(--mat-sys-on-surface-variant);
      }
      .cur-note {
        font-size: 0.85rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 1rem;
      }
      .plan {
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .plan--trial {
        border-color: var(--mat-sys-primary) !important;
      }
      .plan__top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .plan__top h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
      }
      .trial {
        font-size: 0.7rem !important;
        background: var(--mat-sys-primary-container) !important;
        color: var(--mat-sys-on-primary-container) !important;
      }
      .price {
        margin: 0;
      }
      .price .amount {
        font-size: 1.8rem;
        font-weight: 700;
      }
      .price .per {
        color: var(--mat-sys-on-surface-variant);
        margin-left: 0.3rem;
      }
      .fx {
        margin: -0.4rem 0 0;
        font-size: 0.72rem;
        color: var(--mat-sys-on-surface-variant);
      }
      .limits {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        flex: 1;
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
      .cta {
        margin-top: 0.5rem;
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
      .signout {
        align-self: center;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class ChoosePlanPage {
  private readonly subscription = inject(SubscriptionService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly data = signal<StorePlans | null>(null);
  protected readonly loading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.subscription.listPlans().subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Could not load plans.');
      },
    });
  }

  /** Price without symbol; the symbol comes from the response currency. */
  protected amount(cents: number): string {
    return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
  }

  protected choose(plan: StorePlan): void {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.subscription.subscribe(plan.id).subscribe({
      next: () => {
        this.snackBar.open(
          plan.trialDays > 0 ? `Trial started — ${plan.name}` : `Subscribed to ${plan.name}`,
          'Dismiss',
          { duration: 2500 },
        );
        void this.router.navigateByUrl('/admin/dashboard');
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.snackBar.open(err.error?.message ?? 'Could not subscribe.', 'Dismiss', {
          duration: 4000,
        });
      },
    });
  }

  protected signOut(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
