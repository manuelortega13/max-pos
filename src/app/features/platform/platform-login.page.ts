import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { PlatformAuthService } from '../../core/services/platform-auth.service';

@Component({
  selector: 'app-platform-login-page',
  imports: [
    ReactiveFormsModule,
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
          <div class="badge"><mat-icon>shield_person</mat-icon></div>
          <h1>Platform console</h1>
          <p>Sign in to manage all stores</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()">
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Email</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="username" />
            <mat-icon matPrefix>mail</mat-icon>
          </mat-form-field>

          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Password</mat-label>
            <input
              matInput
              [type]="hide() ? 'password' : 'text'"
              formControlName="password"
              autocomplete="current-password"
            />
            <mat-icon matPrefix>lock</mat-icon>
            <button
              type="button"
              mat-icon-button
              matSuffix
              (click)="hide.set(!hide())"
              [attr.aria-label]="hide() ? 'Show password' : 'Hide password'"
            >
              <mat-icon>{{ hide() ? 'visibility' : 'visibility_off' }}</mat-icon>
            </button>
          </mat-form-field>

          @if (error(); as message) {
            <p class="error"><mat-icon>error_outline</mat-icon> {{ message }}</p>
          }

          <button mat-flat-button color="primary" class="w-full" [disabled]="loading()">
            Sign in
          </button>
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
        max-width: 400px;
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
    `,
  ],
})
export class PlatformLoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(PlatformAuthService);
  private readonly router = inject(Router);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hide = signal(true);

  protected submit(): void {
    if (this.loading()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => this.router.navigateByUrl('/platform'),
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(
          err.status === 401 || err.status === 403
            ? 'Invalid email or password.'
            : err.status === 0
              ? 'Cannot reach the server.'
              : 'Something went wrong. Please try again.',
        );
      },
    });
  }
}
