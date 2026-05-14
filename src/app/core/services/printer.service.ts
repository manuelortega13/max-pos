import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

export type PaperSize = '58mm' | '80mm' | 'a4';

/** Structured receipt sent to the local print helper. The helper turns
 *  this into ESC/POS bytes; the browser fallback ignores it (uses the
 *  rendered .print-receipt DOM instead). */
export interface ReceiptPayload {
  storeName: string;
  address: string;
  phone: string;
  saleId: string;
  date: string;
  cashierName?: string;
  paymentMethod: string;
  lines: ReadonlyArray<{ name: string; quantity: number; lineTotal: number }>;
  subtotal: number;
  lineDiscountTotal: number;
  orderDiscountAmount: number;
  tax: number;
  total: number;
  cashReceived?: number;
  change?: number;
  currencySymbol: string;
  footer: string;
}

const AUTO_PRINT_KEY = 'maxpos.printer.autoPrint';
const PAPER_SIZE_KEY = 'maxpos.printer.paperSize';
const HELPER_ENABLED_KEY = 'maxpos.printer.helperEnabled';
const HELPER_URL_KEY = 'maxpos.printer.helperUrl';
const OPEN_DRAWER_KEY = 'maxpos.printer.openDrawer';
const PAGE_STYLE_ID = 'maxpos-printer-page-size';

const DEFAULT_HELPER_URL = 'http://localhost:9100';

/**
 * CSS @page rule per paper size — injected at runtime when the user
 * picks a size. Putting these here (not in styles.css) lets us swap
 * the active rule without touching the global stylesheet, since
 * @page rules can't be selector-scoped or media-queried in browsers.
 */
const PAGE_RULES: Record<PaperSize, string> = {
  // Thermal: zero @page margin everywhere. Two reasons:
  //   1. Chrome injects its print headers (URL / date / page #) into
  //      the @page top margin. With margin=0 there's no room, so
  //      Chrome silently omits them — no garbage at the top of the
  //      receipt.
  //   2. Most thermal drivers ignore @page side margins anyway. The
  //      gutter that actually keeps the first character off the
  //      hardware unprintable zone is the padding inside
  //      .print-receipt (see styles.css).
  '58mm': '@page { size: 58mm auto; margin: 0; }',
  '80mm': '@page { size: 80mm auto; margin: 0; }',
  // A4 keeps a normal printer margin so receipts look like documents
  // (and Chrome's print headers up there don't matter on a full sheet).
  a4: '@page { size: A4; margin: 1cm; }',
};

/**
 * Per-device receipt printer preferences + the trigger that actually
 * fires the print.
 *
 * NOT part of StoreSettings (which is store-wide + admin-managed) —
 * each register configures itself: some have a USB Xprinter attached
 * and want auto-print, others don't have a printer at all.
 *
 * Silent-print setup: this just calls window.print(). To skip the
 * browser print dialog on desktop, launch the PWA via Chrome/Edge
 * with the --kiosk-printing flag and set the receipt printer as the
 * OS default. Without the flag the dialog still appears, which is
 * the right fallback when the app is opened in a normal tab.
 */
@Injectable({ providedIn: 'root' })
export class PrinterService {
  private readonly document = inject(DOCUMENT);
  private readonly _autoPrint = signal<boolean>(this.readAutoPrint());
  private readonly _paperSize = signal<PaperSize>(this.readPaperSize());
  private readonly _helperEnabled = signal<boolean>(this.readHelperEnabled());
  private readonly _helperUrl = signal<string>(this.readHelperUrl());
  private readonly _openDrawer = signal<boolean>(this.readOpenDrawer());

  /** When true, the checkout dialog fires window.print() automatically
   *  the moment the receipt step renders. */
  readonly autoPrint = this._autoPrint.asReadonly();

  /** Paper size — drives the injected @page rule. */
  readonly paperSize = this._paperSize.asReadonly();

  /** When true, printReceipt() POSTs structured JSON to the local
   *  helper service instead of going through window.print(). The
   *  browser path is still used as fallback if the helper is offline. */
  readonly helperEnabled = this._helperEnabled.asReadonly();

  /** Base URL of the local helper service (default http://localhost:9100). */
  readonly helperUrl = this._helperUrl.asReadonly();

  /** When true, every receipt prepends the ESC/POS drawer-kick command
   *  so the cash drawer pops at the moment of sale. Helper-only —
   *  browser print can't send raw bytes to the printer's DK port. */
  readonly openDrawer = this._openDrawer.asReadonly();

  constructor() {
    effect(() => {
      const on = this._autoPrint();
      try {
        this.document.defaultView?.localStorage.setItem(AUTO_PRINT_KEY, on ? '1' : '0');
      } catch {
        // localStorage unavailable (Safari private mode etc.) — best effort.
      }
    });

    effect(() => {
      const size = this._paperSize();
      try {
        this.document.defaultView?.localStorage.setItem(PAPER_SIZE_KEY, size);
      } catch {
        // ignore
      }
      this.applyPageRule(size);
    });

    effect(() => {
      try {
        this.document.defaultView?.localStorage.setItem(
          HELPER_ENABLED_KEY,
          this._helperEnabled() ? '1' : '0',
        );
        this.document.defaultView?.localStorage.setItem(HELPER_URL_KEY, this._helperUrl());
      } catch {
        // ignore
      }
    });

    effect(() => {
      try {
        this.document.defaultView?.localStorage.setItem(
          OPEN_DRAWER_KEY,
          this._openDrawer() ? '1' : '0',
        );
      } catch {
        // ignore
      }
    });
  }

  setAutoPrint(on: boolean): void {
    this._autoPrint.set(on);
  }

  setPaperSize(size: PaperSize): void {
    this._paperSize.set(size);
  }

  setHelperEnabled(on: boolean): void {
    this._helperEnabled.set(on);
  }

  setHelperUrl(url: string): void {
    this._helperUrl.set(url.trim());
  }

  setOpenDrawer(on: boolean): void {
    this._openDrawer.set(on);
  }

  /** Fire the cash drawer's kick pin via the helper. Returns true on
   *  success, false if the helper is offline or disabled. Used by:
   *   - The Ctrl+D shortcut in the cashier shell ("no-sale" drawer open).
   *   - The "Open drawer" button in Settings (test wiring).
   *  Not called from printReceipt — there we send `openDrawer` in the
   *  same /print request so the kick rides along with the receipt. */
  async kickDrawer(): Promise<boolean> {
    return this.postToHelper('/kick', {});
  }

  /**
   * Fire the browser print. The global @media print CSS hides every
   * element except the .print-receipt subtree, so whatever receipt is
   * currently rendered (inside the checkout dialog, or the temporary
   * test container) is what lands on paper.
   *
   * Deferred to a microtask so any DOM mutation that immediately
   * preceded the call (e.g. swapping the dialog step to "receipt")
   * has a chance to paint first.
   */
  print(): void {
    queueMicrotask(() => this.document.defaultView?.print());
  }

  /**
   * Preferred print path. If the helper service is enabled and reachable,
   * POSTs the structured payload (ESC/POS bytes generated server-side,
   * no browser print dialog at all). Otherwise falls back to the
   * @media-print browser flow via print() so receipts still come out —
   * just with the brief Chrome preview flash.
   */
  async printReceipt(payload: ReceiptPayload): Promise<void> {
    if (this._helperEnabled() && this._helperUrl()) {
      // The drawer kick is NOT bundled here on purpose — CheckoutDialog
      // calls kickDrawer() the moment "Confirm Payment" is clicked,
      // well before the cashier hits Print. Pre-kicking lets the
      // cashier reach for change while the sale is still finishing.
      const ok = await this.postToHelper('/print', payload);
      if (ok) return;
      console.warn('[printer] helper unreachable — falling back to browser print');
    }
    this.print();
  }

  /** Ping /health to confirm the helper is up. Returned by the Settings
   *  "Test connection" button so the cashier knows wiring is good
   *  before they ring up a real sale. */
  async pingHelper(): Promise<boolean> {
    const url = this._helperUrl();
    if (!url) return false;
    try {
      const res = await fetch(this.joinUrl(url, '/health'), { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Send a sample receipt via the helper (independent of the
   *  browser-side window.print() testPrint()). */
  async testHelperPrint(): Promise<boolean> {
    return this.postToHelper('/test', {});
  }

  private async postToHelper(path: string, body: unknown): Promise<boolean> {
    const url = this._helperUrl();
    if (!url) return false;
    try {
      const res = await fetch(this.joinUrl(url, path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch (err) {
      console.warn('[printer] helper request failed', err);
      return false;
    }
  }

  private joinUrl(base: string, path: string): string {
    return base.replace(/\/$/, '') + path;
  }

  /**
   * Render a minimal sample receipt and print it. Used by the Settings
   * "Test print" button to verify the kiosk-printing flag and the OS
   * default printer wiring before the cashier rings up a real sale.
   */
  testPrint(): void {
    const win = this.document.defaultView;
    if (!win) return;
    const container = this.document.createElement('section');
    container.className = 'print-receipt';
    container.innerHTML = `
      <header class="receipt__header">
        <strong>Test print</strong>
        <small>MaxPOS receipt printer check</small>
      </header>
      <hr/>
      <ul class="receipt__items">
        <li class="receipt__item">
          <span class="receipt__qty">1×</span>
          <span class="receipt__name">Sample item</span>
          <span class="receipt__amount">1.00</span>
        </li>
      </ul>
      <hr/>
      <div class="receipt__totals">
        <div class="receipt__row receipt__row--grand">
          <span>Total</span>
          <span>1.00</span>
        </div>
      </div>
      <hr/>
      <footer class="receipt__footer">Test page — nothing was sold.</footer>
    `;
    this.document.body.appendChild(container);
    try {
      win.print();
    } finally {
      container.remove();
    }
  }

  private readAutoPrint(): boolean {
    try {
      return this.document.defaultView?.localStorage.getItem(AUTO_PRINT_KEY) === '1';
    } catch {
      return false;
    }
  }

  private readPaperSize(): PaperSize {
    try {
      const saved = this.document.defaultView?.localStorage.getItem(PAPER_SIZE_KEY);
      if (saved === '58mm' || saved === '80mm' || saved === 'a4') return saved;
    } catch {
      // ignore
    }
    return '80mm';
  }

  private readHelperEnabled(): boolean {
    try {
      return this.document.defaultView?.localStorage.getItem(HELPER_ENABLED_KEY) === '1';
    } catch {
      return false;
    }
  }

  private readHelperUrl(): string {
    try {
      return (
        this.document.defaultView?.localStorage.getItem(HELPER_URL_KEY) ?? DEFAULT_HELPER_URL
      );
    } catch {
      return DEFAULT_HELPER_URL;
    }
  }

  private readOpenDrawer(): boolean {
    try {
      return this.document.defaultView?.localStorage.getItem(OPEN_DRAWER_KEY) === '1';
    } catch {
      return false;
    }
  }

  /**
   * Swap the active @page rule. We replace a dedicated <style> tag in
   * <head> so there's only ever one rule live. styles.css intentionally
   * has no @page block of its own — this service owns it end-to-end.
   */
  private applyPageRule(size: PaperSize): void {
    const head = this.document.head;
    if (!head) return;
    let style = this.document.getElementById(PAGE_STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = this.document.createElement('style');
      style.id = PAGE_STYLE_ID;
      head.appendChild(style);
    }
    style.textContent = PAGE_RULES[size];
  }
}
