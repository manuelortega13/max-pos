import { Injectable, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from './auth.service';

export interface RealtimeEvent {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly data: Record<string, unknown>;
  readonly url: string | null;
  readonly timestamp: string;
}

const RECONNECT_DELAY_MS = 5_000;

/**
 * Connects to the backend's SSE stream at /api/notifications/stream and
 * surfaces every received event as a MatSnackBar toast, plus keeps a rolling
 * log in a signal for anyone who wants to render the history.
 *
 * Uses fetch() + ReadableStream instead of native EventSource because the
 * latter can't send the JWT Authorization header.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);

  private abortController: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly _connected = signal<boolean>(false);
  private readonly _events = signal<RealtimeEvent[]>([]);
  private readonly _latestEvent = signal<RealtimeEvent | null>(null);

  readonly connected = this._connected.asReadonly();
  /** Rolling log of received events (most recent first, capped at 50). */
  readonly events = this._events.asReadonly();
  /**
   * Most recent event, or null before anything arrives. Consumers that want
   * to react to specific event types use `effect()` over this signal rather
   * than diffing the full events log.
   */
  readonly latestEvent = this._latestEvent.asReadonly();

  start(): void {
    if (!this.authService.isAuthenticated()) return;
    if (this.abortController) return;
    this.connect();
  }

  stop(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.abortController?.abort();
    this.abortController = null;
    this._connected.set(false);
  }

  private connect(): void {
    const token = this.authService.token();
    if (!token) return;

    const controller = new AbortController();
    this.abortController = controller;

    fetch('/api/notifications/stream', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          throw new Error(`SSE handshake failed (${response.status})`);
        }
        this._connected.set(true);
        await this.readStream(response.body);
      })
      .catch(() => {
        /* network / aborted — handled by scheduleReconnect below */
      })
      .finally(() => {
        this._connected.set(false);
        this.abortController = null;
        if (this.authService.isAuthenticated()) {
          this.scheduleReconnect();
        }
      });
  }

  private async readStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames separated by a blank line (\n\n)
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        this.handleFrame(frame);
      }
    }
  }

  private handleFrame(frame: string): void {
    let eventName = 'message';
    let dataRaw = '';
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataRaw += line.slice(5).trim();
    }
    if (!dataRaw) return;
    if (eventName === 'ready') return; // connect ack

    try {
      const event = JSON.parse(dataRaw) as RealtimeEvent;
      this.record(event);
    } catch {
      /* malformed frame — skip */
    }
  }

  private record(event: RealtimeEvent): void {
    this._events.update((list) => [event, ...list].slice(0, 50));
    this._latestEvent.set(event);
    // Silent events (inventory sync, etc.) drive UI refreshes via signals —
    // they shouldn't toast the admin on every sale or restock.
    if (!this.isSilent(event.type)) {
      this.snackBar.open(`${event.title}: ${event.body}`, 'Dismiss', { duration: 5000 });
    }
  }

  private isSilent(type: string): boolean {
    return type.startsWith('inventory.');
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }
}
