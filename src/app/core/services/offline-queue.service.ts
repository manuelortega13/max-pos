import { Injectable, computed, signal } from '@angular/core';
import { CreateSaleRequest, Sale } from '../models';

/**
 * A single sale that was created while the device was offline (or while the
 * backend was unreachable) and is waiting to be replayed to the server.
 *
 * `optimistic` is the locally-synthesized Sale object that was returned to
 * the UI on create, so when the replay eventually succeeds we can swap the
 * record's canonical reference/id with whatever the backend returns — or
 * drop the optimistic one altogether if the backend rejects the replay.
 */
export interface QueuedSale {
  readonly clientRef: string;
  readonly request: CreateSaleRequest;
  readonly optimistic: Sale;
  readonly enqueuedAt: string;
  attempts: number;
  lastError?: string;
}

const STORAGE_KEY = 'maxpos.offline.sale-queue.v1';

/**
 * Persisted FIFO queue of sales that haven't reached the backend yet.
 *
 * Backed by localStorage because:
 *   - it's synchronous (no Promise ceremony in the hot path of checkout),
 *   - the payload per sale is ~1-2 KB and a cashier's offline window is
 *     capped by the JWT TTL (8h default) — well under the 5-10 MB quota,
 *   - IndexedDB adds a dependency + async everywhere for no practical win
 *     at this scale. Can be swapped later without API changes.
 */
@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  private readonly _queue = signal<QueuedSale[]>(this.readFromStorage());

  readonly queue = this._queue.asReadonly();
  readonly pendingCount = computed(() => this._queue().length);
  readonly hasPending = computed(() => this._queue().length > 0);

  /** Push a new sale to the back of the queue and persist. */
  enqueue(entry: QueuedSale): void {
    this._queue.update((list) => {
      const next = [...list, entry];
      this.writeToStorage(next);
      return next;
    });
  }

  /** Drop a queued entry by its clientRef — use after a successful replay. */
  remove(clientRef: string): void {
    this._queue.update((list) => {
      const next = list.filter((q) => q.clientRef !== clientRef);
      this.writeToStorage(next);
      return next;
    });
  }

  /** Bump attempts + record the error so the UI can surface failing sales. */
  markAttempted(clientRef: string, error?: string): void {
    this._queue.update((list) => {
      const next = list.map((q) =>
        q.clientRef === clientRef
          ? { ...q, attempts: q.attempts + 1, lastError: error }
          : q,
      );
      this.writeToStorage(next);
      return next;
    });
  }

  /** FIFO snapshot for the sync runner. */
  peekAll(): readonly QueuedSale[] {
    return this._queue();
  }

  /** Nuke the queue (used on sign-out so a different cashier doesn't inherit it). */
  clear(): void {
    this._queue.set([]);
    this.writeToStorage([]);
  }

  private readFromStorage(): QueuedSale[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as QueuedSale[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Corrupted storage — safer to discard than to keep replaying bad data.
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
  }

  private writeToStorage(entries: readonly QueuedSale[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      /* Quota exceeded / SecurityError (private mode) — silent. Worst case
         the queue becomes memory-only and is lost on reload. */
    }
  }
}
