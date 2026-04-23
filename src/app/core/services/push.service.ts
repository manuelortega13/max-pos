import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { PwaService } from './pwa.service';

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

/**
 * Wraps the browser's Push API. The typical flow:
 *   1. permission() — see current permission
 *   2. subscribe()  — prompts the user, registers with the backend
 *   3. unsubscribe() — cleanup on sign-out or opt-out
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly pwa = inject(PwaService);

  private readonly _permission = signal<PermissionState>(this.detectPermission());
  private readonly _subscribed = signal<boolean>(false);

  readonly permission = this._permission.asReadonly();
  readonly subscribed = this._subscribed.asReadonly();

  /**
   * Attempt to enable push notifications for the current admin. Returns true
   * on success; caller can toast the result. Fails silently (with a console
   * warning) if the browser denied permission or the backend has no VAPID.
   */
  async enable(): Promise<boolean> {
    if (!this.authService.isAdmin()) return false;
    const reg = await this.ensureRegistration();
    if (!reg) return false;

    if (Notification.permission === 'denied') {
      this._permission.set('denied');
      return false;
    }
    if (Notification.permission !== 'granted') {
      const res = await Notification.requestPermission();
      this._permission.set(res as PermissionState);
      if (res !== 'granted') return false;
    } else {
      this._permission.set('granted');
    }

    const keyResponse = await firstValueFrom(
      this.http.get<{ publicKey: string }>('/api/push/vapid-public-key'),
    );
    if (!keyResponse.publicKey) {
      console.warn('[maxpos] Server has no VAPID public key; push disabled');
      return false;
    }

    const existing = await reg.pushManager.getSubscription();
    const subscription =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Uint8Array → ArrayBuffer via .buffer keeps the Push API type happy
        applicationServerKey: urlBase64ToUint8Array(keyResponse.publicKey).buffer as ArrayBuffer,
      }));

    await firstValueFrom(
      this.http.post('/api/push/subscribe', {
        endpoint: subscription.endpoint,
        p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
        auth: arrayBufferToBase64(subscription.getKey('auth')),
      }),
    );
    this._subscribed.set(true);
    return true;
  }

  async disable(): Promise<void> {
    const reg = this.pwa.registration();
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) {
      this._subscribed.set(false);
      return;
    }
    try {
      await firstValueFrom(
        this.http.post('/api/push/unsubscribe', { endpoint: sub.endpoint }),
      );
    } catch {
      /* still unsubscribe locally even if server call fails */
    }
    await sub.unsubscribe();
    this._subscribed.set(false);
  }

  async refreshState(): Promise<void> {
    this._permission.set(this.detectPermission());
    const reg = this.pwa.registration();
    if (!reg) {
      this._subscribed.set(false);
      return;
    }
    const sub = await reg.pushManager.getSubscription();
    this._subscribed.set(!!sub);
  }

  private async ensureRegistration(): Promise<ServiceWorkerRegistration | null> {
    const existing = this.pwa.registration();
    if (existing) return existing;
    return this.pwa.register();
  }

  private detectPermission(): PermissionState {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission as PermissionState;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
