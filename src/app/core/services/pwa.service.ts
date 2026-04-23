import { Injectable, signal } from '@angular/core';

/**
 * Registers the site-level Service Worker (`/sw.js`) that handles Web Push
 * and PWA install behavior. Skipped in dev (SW caches too aggressively; use
 * a prod build when you want to actually test the PWA install / push flow).
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly _registration = signal<ServiceWorkerRegistration | null>(null);
  readonly registration = this._registration.asReadonly();

  async register(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) return null;
    // Only register on an origin served over HTTPS or localhost (SW requirement)
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return null;

    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      this._registration.set(reg);
      return reg;
    } catch (err) {
      console.warn('[maxpos] Service worker registration failed', err);
      return null;
    }
  }
}
