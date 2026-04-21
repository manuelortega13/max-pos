import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SettingsService } from '../../../core/services/settings.service';

@Component({
  selector: 'app-settings-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatDividerModule,
    MatSlideToggleModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(SettingsService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly currencies = [
    { code: 'USD', symbol: '$', label: 'US Dollar' },
    { code: 'EUR', symbol: '€', label: 'Euro' },
    { code: 'PHP', symbol: '₱', label: 'Philippine Peso' },
    { code: 'MXN', symbol: '$', label: 'Mexican Peso' },
  ];

  protected readonly form = this.fb.nonNullable.group({
    storeName: [this.settingsService.settings().storeName, Validators.required],
    currency: [this.settingsService.settings().currency, Validators.required],
    currencySymbol: [this.settingsService.settings().currencySymbol, Validators.required],
    taxRate: [
      this.settingsService.settings().taxRate * 100,
      [Validators.required, Validators.min(0), Validators.max(100)],
    ],
    receiptFooter: [this.settingsService.settings().receiptFooter],
    address: [this.settingsService.settings().address],
    phone: [this.settingsService.settings().phone],
  });

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.settingsService.update({
      ...value,
      taxRate: value.taxRate / 100,
    });
    this.snackBar.open('Settings saved', 'Dismiss', { duration: 2500 });
  }

  protected reset(): void {
    const current = this.settingsService.settings();
    this.form.reset({
      storeName: current.storeName,
      currency: current.currency,
      currencySymbol: current.currencySymbol,
      taxRate: current.taxRate * 100,
      receiptFooter: current.receiptFooter,
      address: current.address,
      phone: current.phone,
    });
  }
}
