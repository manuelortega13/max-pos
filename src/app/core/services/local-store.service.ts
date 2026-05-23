import { Injectable } from '@angular/core';

/**
 * Lightweight IndexedDB wrapper for state the Service Worker cache
 * can't cover: cached user records used for offline login (incl. a
 * locally-computed bcrypt hash of the password), the device-scoped
 * JWT secret used to mint offline session tokens, and a small kv
 * store for misc state (current business day snapshot, last sync
 * timestamp, etc.).
 *
 * Native IDB on purpose — the API surface is tiny and a third-party
 * wrapper isn't worth the dependency footprint.
 */

const DB_NAME = 'maxpos-local';
const DB_VERSION = 1;
const STORE_USERS = 'users';
const STORE_KV = 'kv';

export interface CachedUser {
  /** Lowercased email — also the keyPath for the users store. */
  readonly email: string;
  readonly userId: string;
  readonly name: string;
  readonly role: 'ADMIN' | 'CASHIER';
  /**
   * bcrypt hash of the password as entered at the last successful
   * online login, hashed CLIENT-SIDE (server hashes never cross the
   * wire). Used by AuthService.login when the network is unreachable.
   */
  readonly localHash: string;
  /** ms epoch — used to expire stale cached users. */
  readonly lastUsedAt: number;
}

@Injectable({ providedIn: 'root' })
export class LocalStoreService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  // ─────────────────── users (offline-login cache) ───────────────────

  async getCachedUser(email: string): Promise<CachedUser | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_USERS, 'readonly');
      const req = tx.objectStore(STORE_USERS).get(email.toLowerCase());
      req.onsuccess = () => resolve((req.result as CachedUser | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async saveCachedUser(user: CachedUser): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_USERS, 'readwrite');
      tx.objectStore(STORE_USERS).put({ ...user, email: user.email.toLowerCase() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteCachedUser(email: string): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_USERS, 'readwrite');
      tx.objectStore(STORE_USERS).delete(email.toLowerCase());
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ──────────────────────── generic kv store ─────────────────────────

  async kvGet<T = unknown>(key: string): Promise<T | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_KV, 'readonly');
      const req = tx.objectStore(STORE_KV).get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async kvSet<T = unknown>(key: string, value: T): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_KV, 'readwrite');
      tx.objectStore(STORE_KV).put(value as unknown as never, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async kvDelete(key: string): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_KV, 'readwrite');
      tx.objectStore(STORE_KV).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ───────────────────────────── internals ────────────────────────────

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      // SSR / older Safari guard — IDB isn't always available.
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available in this environment'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_USERS)) {
          db.createObjectStore(STORE_USERS, { keyPath: 'email' });
        }
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }
}
