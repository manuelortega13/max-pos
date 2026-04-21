import { Pipe, PipeTransform, inject } from '@angular/core';
import { SettingsService } from '../../core/services/settings.service';

@Pipe({ name: 'money', pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly settingsService = inject(SettingsService);

  transform(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return '';
    const { currencySymbol } = this.settingsService.settings();
    return `${currencySymbol}${value.toFixed(2)}`;
  }
}
