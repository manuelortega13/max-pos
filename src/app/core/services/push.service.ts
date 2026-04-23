import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

/**
 * Web Push wrapper built on Angular's SwPush. The browser's ngsw-worker is
 * registered by app.config.ts; here we just handle the subscribe/unsubscribe
 * handshake with the backend and react to notification clicks.
 *
 * Usage from the admin UI:
 *   1. refreshState() to see current permission + whether we're subscribed
 *   2. enable()      — prompts permission, registers with backend
 *   3. disable()     — opt-out + cleanup on sign-out
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly swPush = inject(SwPush);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _permission = signal<PermissionState>(this.detectPermission());
  private readonly _subscribed = signal<boolean>(false);

  readonly permission = this._permission.asReadonly();
  readonly subscribed = this._subscribed.asReadonly();

  constructor() {
    // Keep the local `subscribed` signal in lockstep with the real SW subscription
    // — matters when the user enables push in another tab, or the SW re-registers.
    this.swPush.subscription
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sub) => this._subscribed.set(!!sub));

    // Route to the target URL encoded in the notification's `data.url` when
    // the admin clicks a push notification (fires even after app was closed).
    this.swPush.notificationClicks
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ notification }) => {
        const target = (notification.data as { url?: string } | undefined)?.url;
        if (target) this.router.navigateByUrl(target);
      });
  }

  /**
   * Attempt to enable push notifications for the current admin. Returns true
   * on success; caller can toast the result. Fails (with console warning) if
   * the browser denied permission, the SW isn't active, or the backend has
   * no VAPID keys configured.
   */
  async enable(): Promise<boolean> {
    if (!this.authService.isAdmin()) return false;
    if (!this.swPush.isEnabled) {
      console.warn('[maxpos] Service worker not enabled; run a production build');
      return false;
    }

    if (Notification.permission === 'denied') {
      this._permission.set('denied');
      return false;
    }

    const keyResponse = await firstValueFrom(
      this.http.get<{ publicKey: string }>('/api/push/vapid-public-key'),
    );
    if (!keyResponse.publicKey) {
      console.warn('[maxpos] Server has no VAPID public key; push disabled');
      return false;
    }

    try {
      const subscription = await this.swPush.requestSubscription({
        serverPublicKey: keyResponse.publicKey,
      });
      this._permission.set('granted');

      await firstValueFrom(
        this.http.post('/api/push/subscribe', {
          endpoint: subscription.endpoint,
          p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
          auth: arrayBufferToBase64(subscription.getKey('auth')),
        }),
      );
      this._subscribed.set(true);
      return true;
    } catch (err) {
      // requestSubscription rejects on permission denial or SW failure
      this._permission.set(this.detectPermission());
      console.warn('[maxpos] Push subscription failed', err);
      return false;
    }
  }

  async disable(): Promise<void> {
    if (!this.swPush.isEnabled) {
      this._subscribed.set(false);
      return;
    }
    const sub = await firstValueFrom(this.swPush.subscription);
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
    try {
      await this.swPush.unsubscribe();
    } catch {
      /* browser may have already dropped the subscription */
    }
    this._subscribed.set(false);
  }

  async refreshState(): Promise<void> {
    this._permission.set(this.detectPermission());
    if (!this.swPush.isEnabled) {
      this._subscribed.set(false);
      return;
    }
    const sub = await firstValueFrom(this.swPush.subscription);
    this._subscribed.set(!!sub);
  }

  private detectPermission(): PermissionState {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission as PermissionState;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
