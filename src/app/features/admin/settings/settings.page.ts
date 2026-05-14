import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SettingsService } from '../../../core/services/settings.service';
import { ThemeService } from '../../../core/services/theme.service';
import { PaperSize, PrinterService } from '../../../core/services/printer.service';

@Component({
  selector: 'app-settings-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(SettingsService);
  private readonly themeService = inject(ThemeService);
  private readonly printerService = inject(PrinterService);
  private readonly snackBar = inject(MatSnackBar);

  /** Bound to the slide toggle. True = dark mode (toggle "on" = on-brand dark). */
  protected readonly darkTheme = this.themeService.mode;

  protected toggleTheme(dark: boolean): void {
    this.themeService.set(dark ? 'dark' : 'light');
  }

  /** Per-device receipt-printer toggles. Wired straight to the
   *  signal — Settings page doesn't need to save these via API. */
  protected readonly autoPrint = this.printerService.autoPrint;
  protected readonly paperSize = this.printerService.paperSize;
  protected readonly helperEnabled = this.printerService.helperEnabled;
  protected readonly helperUrl = this.printerService.helperUrl;
  protected readonly helperStatus = signal<'unknown' | 'ok' | 'down' | 'checking'>('unknown');
  protected readonly openDrawer = this.printerService.openDrawer;

  protected toggleAutoPrint(on: boolean): void {
    this.printerService.setAutoPrint(on);
  }

  protected setPaperSize(size: PaperSize): void {
    this.printerService.setPaperSize(size);
  }

  protected toggleHelper(on: boolean): void {
    this.printerService.setHelperEnabled(on);
  }

  protected onHelperUrlChange(url: string): void {
    this.printerService.setHelperUrl(url);
    this.helperStatus.set('unknown');
  }

  protected async testHelper(): Promise<void> {
    this.helperStatus.set('checking');
    const ok = await this.printerService.pingHelper();
    if (!ok) {
      this.helperStatus.set('down');
      return;
    }
    const printed = await this.printerService.testHelperPrint();
    this.helperStatus.set(printed ? 'ok' : 'down');
  }

  protected toggleOpenDrawer(on: boolean): void {
    this.printerService.setOpenDrawer(on);
  }

  protected async kickDrawer(): Promise<void> {
    const ok = await this.printerService.kickDrawer();
    this.snackBar.open(
      ok ? 'Drawer kicked.' : 'Could not reach the print helper.',
      'Dismiss',
      { duration: 2500 },
    );
  }

  protected testPrint(): void {
    this.printerService.testPrint();
  }

  protected readonly currencies = [
    { code: 'USD', symbol: '$', label: 'US Dollar' },
    { code: 'EUR', symbol: '€', label: 'Euro' },
    { code: 'PHP', symbol: '₱', label: 'Philippine Peso' },
    { code: 'MXN', symbol: '$', label: 'Mexican Peso' },
  ];

  protected readonly loading = this.settingsService.loading;
  protected readonly loadError = this.settingsService.error;
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    storeName: ['', Validators.required],
    currency: ['USD', Validators.required],
    currencySymbol: ['$', Validators.required],
    taxRate: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    receiptFooter: [''],
    address: [''],
    phone: [''],
    allowNegativeStock: [false],
    offlineModeEnabled: [false],
  });

  constructor() {
    // Reset the form whenever the service's settings signal changes (initial
    // load, or after a save). `pristine` keeps the "Save" button disabled
    // until the user actually edits something.
    effect(() => {
      const s = this.settingsService.settings();
      if (!s.storeName) return; // still the fallback; wait for real data
      this.form.reset(
        {
          storeName: s.storeName,
          currency: s.currency,
          currencySymbol: s.currencySymbol,
          taxRate: s.taxRate * 100,
          receiptFooter: s.receiptFooter ?? '',
          address: s.address ?? '',
          phone: s.phone ?? '',
          allowNegativeStock: s.allowNegativeStock,
          offlineModeEnabled: s.offlineModeEnabled,
        },
        { emitEvent: false },
      );
    });

    // When user picks a currency, auto-fill the symbol to match (they can
    // still override afterwards).
    this.form.controls.currency.valueChanges.subscribe((code) => {
      const currency = this.currencies.find((c) => c.code === code);
      if (currency) {
        this.form.controls.currencySymbol.setValue(currency.symbol, { emitEvent: false });
      }
    });

    // Paired-toggle invariant: offline mode requires allow-negative-stock.
    // Enabling offline flips allow-negative on automatically (help); turning
    // allow-negative off pulls offline off with it (enforce).
    this.form.controls.offlineModeEnabled.valueChanges.subscribe((on) => {
      if (on && !this.form.controls.allowNegativeStock.value) {
        this.form.controls.allowNegativeStock.setValue(true, { emitEvent: false });
      }
    });
    this.form.controls.allowNegativeStock.valueChanges.subscribe((on) => {
      if (!on && this.form.controls.offlineModeEnabled.value) {
        this.form.controls.offlineModeEnabled.setValue(false, { emitEvent: false });
      }
    });
  }

  protected save(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);

    const value = this.form.getRawValue();
    this.settingsService
      .save({
        storeName: value.storeName,
        currency: value.currency,
        currencySymbol: value.currencySymbol,
        taxRate: value.taxRate / 100,
        receiptFooter: value.receiptFooter,
        address: value.address,
        phone: value.phone,
        allowNegativeStock: value.allowNegativeStock,
        offlineModeEnabled: value.offlineModeEnabled,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.form.markAsPristine();
          this.snackBar.open('Settings saved', 'Dismiss', { duration: 2500 });
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.saveError.set(this.describe(err));
        },
      });
  }

  protected reset(): void {
    const s = this.settingsService.settings();
    this.form.reset({
      storeName: s.storeName,
      currency: s.currency,
      currencySymbol: s.currencySymbol,
      taxRate: s.taxRate * 100,
      receiptFooter: s.receiptFooter ?? '',
      address: s.address ?? '',
      phone: s.phone ?? '',
      allowNegativeStock: s.allowNegativeStock,
      offlineModeEnabled: s.offlineModeEnabled,
    });
    this.saveError.set(null);
  }

  protected retry(): void {
    this.settingsService.load();
  }

  private describe(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Cannot reach the server.';
    if (err.status === 403) return 'Only admins can change store settings.';
    if (err.status === 400) return err.error?.message ?? 'Validation failed.';
    const apiMessage =
      err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message?: unknown }).message)
        : null;
    return apiMessage ?? 'Something went wrong.';
  }
}
