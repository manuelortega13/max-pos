import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthResponse } from '../../core/models';
import { symbolFor } from '../../core/data/currencies';
import { AuthService } from '../../core/services/auth.service';
import { CurrencySelect } from '../../shared/components/currency-select';

interface RegistrationDefaults {
  readonly currency: string;
  readonly currencySymbol: string;
}

@Component({
  selector: 'app-register-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CurrencySelect,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <mat-card appearance="outlined" class="card">
        @if (loading()) {
          <mat-progress-bar mode="indeterminate"></mat-progress-bar>
        }
        <div class="head">
          <div class="badge"><mat-icon>storefront</mat-icon></div>
          <h1>Create your store</h1>
          <p>Set up MaxPOS for your shop in a minute</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()">
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Store name</mat-label>
            <input matInput formControlName="storeName" />
          </mat-form-field>

          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Store URL</mat-label>
            <input matInput formControlName="slug" placeholder="my-store" />
            <span matTextPrefix>/&nbsp;</span>
            @if (form.controls.slug.touched && form.controls.slug.hasError('pattern')) {
              <mat-error>Lowercase letters, numbers, and hyphens only.</mat-error>
            }
          </mat-form-field>

          <app-currency-select [formControl]="form.controls.currency" label="Currency" />

          <div class="divider">Your admin account</div>

          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Your name</mat-label>
            <input matInput formControlName="adminName" autocomplete="name" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Email</mat-label>
            <input matInput type="email" formControlName="adminEmail" autocomplete="email" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Password</mat-label>
            <input
              matInput
              [type]="hide() ? 'password' : 'text'"
              formControlName="adminPassword"
              autocomplete="new-password"
            />
            <button
              type="button"
              mat-icon-button
              matSuffix
              (click)="hide.set(!hide())"
              [attr.aria-label]="hide() ? 'Show password' : 'Hide password'"
            >
              <mat-icon>{{ hide() ? 'visibility' : 'visibility_off' }}</mat-icon>
            </button>
            @if (
              form.controls.adminPassword.touched &&
              form.controls.adminPassword.hasError('minlength')
            ) {
              <mat-error>At least 6 characters.</mat-error>
            }
          </mat-form-field>

          @if (error(); as message) {
            <p class="error"><mat-icon>error_outline</mat-icon> {{ message }}</p>
          }

          <button mat-flat-button color="primary" class="w-full" [disabled]="loading()">
            Create store
          </button>
          <p class="foot">Already have a store? <a routerLink="/login">Sign in</a></p>
        </form>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .wrap {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        background: var(--mat-sys-surface-container-low);
      }
      .card {
        width: 100%;
        max-width: 440px;
        padding: 1.5rem;
        overflow: hidden;
      }
      .head {
        text-align: center;
        margin-bottom: 1.25rem;
      }
      .badge {
        width: 3rem;
        height: 3rem;
        border-radius: 0.75rem;
        margin: 0 auto 0.75rem;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
      }
      h1 {
        margin: 0;
        font-size: 1.35rem;
        font-weight: 600;
      }
      .head p {
        margin: 0.25rem 0 0;
        color: var(--mat-sys-on-surface-variant);
      }
      form {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .w-full {
        width: 100%;
      }
      .row {
        display: flex;
        gap: 0.75rem;
      }
      .row mat-form-field {
        flex: 1;
      }
      .divider {
        margin: 0.5rem 0 0.75rem;
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--mat-sys-on-surface-variant);
      }
      .error {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        color: var(--mat-sys-error);
        font-size: 0.9rem;
        margin: 0 0 0.75rem;
      }
      .error mat-icon {
        font-size: 1.1rem;
        width: 1.1rem;
        height: 1.1rem;
      }
      .foot {
        text-align: center;
        margin: 0.75rem 0 0;
        color: var(--mat-sys-on-surface-variant);
        font-size: 0.9rem;
      }
    `,
  ],
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = this.fb.nonNullable.group({
    storeName: ['', [Validators.required, Validators.maxLength(255)]],
    slug: ['', [Validators.required, Validators.maxLength(64), Validators.pattern('[a-z0-9-]+')]],
    currency: ['USD', [Validators.required, Validators.maxLength(8)]],
    adminName: ['', [Validators.required, Validators.maxLength(255)]],
    adminEmail: ['', [Validators.required, Validators.email]],
    adminPassword: ['', [Validators.required, Validators.minLength(6)]],
  });

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hide = signal(true);

  constructor() {
    // Pre-select the platform's default currency (public endpoint). On
    // failure we keep the USD default already set on the form.
    this.http.get<RegistrationDefaults>('/api/stores/register/defaults').subscribe({
      next: (d) => {
        if (d?.currency) this.form.controls.currency.setValue(d.currency);
      },
      error: () => {},
    });
  }

  protected submit(): void {
    if (this.loading()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const payload = {
      ...this.form.getRawValue(),
      // Derive the symbol from the chosen currency code.
      currencySymbol: symbolFor(this.form.controls.currency.value),
    };
    this.http.post<AuthResponse>('/api/stores/register', payload).subscribe({
      next: (res) => {
        // Auto-login into the new store's admin, then have them pick a plan.
        if (this.auth.adoptToken(res.token)) {
          void this.router.navigateByUrl('/subscribe');
        } else {
          void this.router.navigateByUrl('/login');
        }
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(
          err.status === 409
            ? (err.error?.message ?? 'That store URL or email is already taken.')
            : err.status === 0
              ? 'Cannot reach the server.'
              : (err.error?.message ?? 'Could not create the store. Please try again.'),
        );
      },
    });
  }
}
