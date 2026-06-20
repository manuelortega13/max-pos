import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { symbolFor } from '../../core/data/currencies';
import { PlatformSettingsService } from '../../core/services/platform-settings.service';
import { CurrencySelect } from '../../shared/components/currency-select';

@Component({
  selector: 'app-platform-settings-page',
  imports: [
    ReactiveFormsModule,
    CurrencySelect,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="wrap">
      <header class="head">
        <h1>Settings</h1>
        <p>Platform-wide configuration</p>
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

      <mat-card appearance="outlined" class="card">
        <h2>Default currency</h2>
        <p class="hint">
          Pre-selected when a new store registers, and used to format revenue across the console.
        </p>
        <app-currency-select [formControl]="currency" label="Currency" />
        @if (preview(); as p) {
          <p class="preview">
            Symbol: <strong>{{ p }}</strong>
          </p>
        }
        <div class="actions">
          <button
            mat-flat-button
            color="primary"
            [disabled]="currency.invalid || saving()"
            (click)="save()"
          >
            Save
          </button>
        </div>
      </mat-card>
    </section>
  `,
  styles: [
    `
      .wrap {
        max-width: 600px;
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
      .card {
        padding: 1.5rem;
      }
      .card h2 {
        margin: 0 0 0.25rem;
        font-size: 1.15rem;
        font-weight: 600;
      }
      .hint {
        margin: 0 0 1rem;
        color: var(--mat-sys-on-surface-variant);
        font-size: 0.9rem;
      }
      .preview {
        margin: 0 0 1rem;
        color: var(--mat-sys-on-surface-variant);
      }
      .actions {
        display: flex;
        justify-content: flex-end;
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
export class PlatformSettingsPage {
  private readonly settings = inject(PlatformSettingsService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly currency = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  private readonly code = toSignal(this.currency.valueChanges.pipe(startWith('')), {
    initialValue: '',
  });
  protected readonly preview = computed(() => symbolFor(this.code()));

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.settings.load().subscribe({
      next: (s) => {
        this.currency.setValue(s.defaultCurrency);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Could not load settings.');
      },
    });
  }

  protected save(): void {
    if (this.currency.invalid) return;
    const code = this.currency.value;
    this.saving.set(true);
    this.settings
      .save({ defaultCurrency: code, defaultCurrencySymbol: symbolFor(code) })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snackBar.open('Settings saved.', 'Dismiss', { duration: 2500 });
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.snackBar.open(err.error?.message ?? 'Could not save settings.', 'Dismiss', {
            duration: 4000,
          });
        },
      });
  }
}
