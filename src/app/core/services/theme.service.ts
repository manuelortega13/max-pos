import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'maxpos.theme';
const LIGHT_CLASS = 'theme-light';
/**
 * Surface color per theme — kept in sync with the prebuilt CSS files so
 * the iOS/Android PWA status bar matches the active mode.
 *  - light: azure-blue's --mat-sys-surface
 *  - dark : cyan-orange's --mat-sys-surface
 */
const THEME_COLORS: Record<ThemeMode, string> = {
  light: '#fafdfc',
  dark: '#101414',
};

/**
 * Per-device light/dark theme preference, persisted in localStorage.
 * NOT part of StoreSettings (which is store-wide + admin-managed) —
 * each cashier's device may pick its own preference.
 *
 * On first load index.html runs a tiny inline script that applies the
 * `theme-light` class before Angular bootstraps so there's no flash of
 * the wrong theme. This service then takes over for runtime toggles.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly _mode = signal<ThemeMode>(this.readInitial());

  readonly mode = this._mode.asReadonly();

  constructor() {
    effect(() => {
      const mode = this._mode();
      const html = this.document.documentElement;
      html.classList.toggle(LIGHT_CLASS, mode === 'light');

      try {
        this.document.defaultView?.localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // localStorage unavailable (Safari private mode etc.) — best effort.
      }

      const meta = this.document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', THEME_COLORS[mode]);
    });
  }

  set(mode: ThemeMode): void {
    this._mode.set(mode);
  }

  private readInitial(): ThemeMode {
    try {
      const saved = this.document.defaultView?.localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // ignore
    }
    return 'dark';
  }
}
