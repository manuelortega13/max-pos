import { Injectable, signal } from '@angular/core';
import { StoreSettings } from '../models';
import { SETTINGS_MOCK } from '../mock-data/settings.mock';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly _settings = signal<StoreSettings>(SETTINGS_MOCK);

  readonly settings = this._settings.asReadonly();

  update(patch: Partial<StoreSettings>): void {
    this._settings.update((current) => ({ ...current, ...patch }));
  }
}
