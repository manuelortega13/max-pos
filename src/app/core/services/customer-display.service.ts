import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { CartService, lineNet } from './cart.service';
import { SettingsService } from './settings.service';

/**
 * One item shown on the customer display. We snapshot just what the
 * display needs — name, qty, the post-discount line total — so the
 * receiving tab doesn't need to reach back into ProductService or
 * recompute discounts.
 */
export interface DisplayItem {
  readonly productId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly lineTotal: number;
  readonly discountAmount?: number;
}

/**
 * Discriminated union for the three states the customer-facing screen
 * can be in. The display page renders a different layout per `kind`.
 */
export type DisplayState =
  | {
      kind: 'idle';
      storeName: string;
      cashierName: string | null;
    }
  | {
      kind: 'active';
      storeName: string;
      cashierName: string | null;
      currency: string;
      items: ReadonlyArray<DisplayItem>;
      subtotal: number;
      tax: number;
      lineDiscountTotal: number;
      orderDiscountAmount: number;
      total: number;
      /** ms-epoch the cart last changed — drives the line-flash effect. */
      lastChangedAt: number;
    }
  | {
      kind: 'completed';
      storeName: string;
      cashierName: string | null;
      currency: string;
      total: number;
      cashReceived: number | null;
      change: number | null;
      /** ms-epoch the sale completed — drives the thank-you screen timer. */
      completedAt: number;
    };

const CHANNEL_NAME = 'maxpos-customer-display';
const COMPLETED_MS = 10_000; // thank-you screen visible duration

interface RequestStateMsg { type: 'request-state' }
interface StateMsg        { type: 'state'; payload: DisplayState }
type Msg = RequestStateMsg | StateMsg;

/**
 * Same-browser sync between the cashier POS tab and the customer-
 * facing /display tab using the BroadcastChannel API.
 *
 * Architecture:
 *   - Both tabs hold one of these as a singleton (`providedIn: 'root'`).
 *   - The cashier tab calls {@link startPublishing} when the POS page
 *     mounts; an effect() watches CartService signals and broadcasts
 *     the current state every time anything changes. Idempotent.
 *   - The display tab subscribes via {@link state} and renders.
 *   - On display-tab mount it sends a 'request-state' ping; the
 *     cashier tab answers with its current snapshot so the display
 *     comes up populated without waiting for the next cart edit.
 *
 * BroadcastChannel doesn't loop back to the posting tab, so we never
 * receive our own messages — no echo handling needed.
 */
@Injectable({ providedIn: 'root' })
export class CustomerDisplayService {
  private readonly cart = inject(CartService);
  private readonly auth = inject(AuthService);
  private readonly settings = inject(SettingsService);

  private channel: BroadcastChannel | null = null;
  private publishing = false;
  /** Timer that flips the display back to idle some seconds after a
   *  'completed' broadcast — purely a UX nicety. */
  private completedTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly _state = signal<DisplayState>(this.buildIdle());
  /** Current state for the display page to render. */
  readonly state = this._state.asReadonly();

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.addEventListener('message', this.onMessage);
    }
    // The cart-watching effect MUST live in the constructor's
    // injection context. It still reads CartService signals
    // unconditionally so the dependency graph is stable; the
    // `publishing` gate decides whether to broadcast or not.
    effect(() => {
      const snapshot = this.snapshotCart();
      if (this.publishing) this.broadcast(snapshot);
    });
  }

  // ─────────────────────── publisher (cashier) ────────────────────────

  /** Start broadcasting cart changes to the customer display.
   *  Called by the POS page in ngOnInit. Idempotent. */
  startPublishing(): void {
    if (this.publishing || !this.channel) return;
    this.publishing = true;
    // Push the current snapshot immediately so a display tab that's
    // already open doesn't need to wait for the next cart edit.
    this.broadcast(this.snapshotCart());
  }

  /** Stop broadcasting. Called by the POS page in ngOnDestroy.
   *  The effect keeps running (cheap, no-op without `publishing`)
   *  so we don't have to manually unhook it. */
  stopPublishing(): void {
    if (!this.publishing) return;
    this.publishing = false;
    this.broadcast(this.buildIdle());
  }

  /** Hand off to the display tab that a sale just completed. The
   *  display shows a thank-you for {@link COMPLETED_MS} ms, then
   *  reverts to idle. Safe to call when no display tab is open. */
  broadcastCompleted(total: number, cashReceived: number | null, change: number | null): void {
    const msg: DisplayState = {
      kind: 'completed',
      storeName: this.storeName(),
      cashierName: this.cashierName(),
      currency: this.currency(),
      total,
      cashReceived,
      change,
      completedAt: Date.now(),
    };
    this.broadcast(msg);
  }

  // ─────────────────────── internals ────────────────────────────────

  private onMessage = (ev: MessageEvent<Msg>) => {
    const msg = ev.data;
    if (!msg) return;
    if (msg.type === 'state') {
      this.applyIncomingState(msg.payload);
      return;
    }
    if (msg.type === 'request-state' && this.publishing) {
      // Display tab just opened — push our current snapshot so it
      // doesn't sit on the idle welcome until the next cart edit.
      this.broadcast(this.snapshotCart());
    }
  };

  private applyIncomingState(state: DisplayState): void {
    this._state.set(state);
    if (this.completedTimer !== null) {
      clearTimeout(this.completedTimer);
      this.completedTimer = null;
    }
    if (state.kind === 'completed') {
      this.completedTimer = setTimeout(() => {
        // Only fall back to idle if the cashier hasn't moved on already.
        if (this._state().kind === 'completed') this._state.set(this.buildIdle());
      }, COMPLETED_MS);
    }
  }

  private broadcast(payload: DisplayState): void {
    this.channel?.postMessage({ type: 'state', payload } satisfies StateMsg);
  }

  /** Called by the display tab on mount via {@link requestInitialState}. */
  requestInitialState(): void {
    this.channel?.postMessage({ type: 'request-state' } satisfies RequestStateMsg);
  }

  // ─────────────────────── snapshot helpers ──────────────────────────

  private snapshotCart(): DisplayState {
    const lines = this.cart.lines();
    if (lines.length === 0) return this.buildIdle();

    const items: DisplayItem[] = lines.map((l) => {
      const net = lineNet(l);
      return {
        productId: l.product.id,
        name: l.product.name,
        quantity: l.quantity,
        unitPrice: l.product.price,
        lineTotal: net,
        discountAmount:
          l.discount && net !== l.product.price * l.quantity
            ? l.product.price * l.quantity - net
            : undefined,
      };
    });

    return {
      kind: 'active',
      storeName: this.storeName(),
      cashierName: this.cashierName(),
      currency: this.currency(),
      items,
      subtotal: this.cart.subtotal(),
      tax: this.cart.tax(),
      lineDiscountTotal: this.cart.lineDiscountTotal(),
      orderDiscountAmount: this.cart.orderDiscountAmount(),
      total: this.cart.total(),
      lastChangedAt: Date.now(),
    };
  }

  private buildIdle(): DisplayState {
    return {
      kind: 'idle',
      storeName: this.storeName(),
      cashierName: this.cashierName(),
    };
  }

  private storeName(): string {
    return this.settings.settings().storeName;
  }
  private currency(): string {
    return this.settings.settings().currencySymbol;
  }
  private cashierName(): string | null {
    return this.auth.user()?.name ?? null;
  }
}
