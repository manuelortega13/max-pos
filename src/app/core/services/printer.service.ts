import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';
import { BusinessDay, CreditorPayment, GcashTransaction, LoadTransaction } from '../models';

export type PaperSize = '58mm' | '80mm' | 'a4';

/** Structured Z-report sent to the local print helper. The helper renders
 *  a payment-method breakdown + cash drawer reconciliation; the browser
 *  fallback renders an equivalent .print-receipt DOM and calls window.print(). */
/** Structured credit-payment receipt sent to the local print helper.
 *  Browser fallback renders the equivalent DOM via .print-receipt
 *  and calls window.print(). */
export interface CreditPaymentReceiptPayload {
  storeName: string;
  address: string;
  phone: string;
  footer: string;
  currencySymbol: string;
  payment: CreditorPayment;
  /** Outstanding balance before this payment. */
  balanceBefore: number;
  /** Outstanding balance after this payment. */
  balanceAfter: number;
}

export interface ZReportPayload {
  storeName: string;
  address: string;
  phone: string;
  footer: string;
  currencySymbol: string;
  day: BusinessDay;
}

/** Structured GCash receipt sent to the local print helper. Browser
 *  fallback renders the equivalent .print-receipt DOM. */
export interface GcashReceiptPayload {
  storeName: string;
  address: string;
  phone: string;
  footer: string;
  currencySymbol: string;
  transaction: GcashTransaction;
}

/** Structured load receipt sent to the local print helper. Same
 *  shape as the GCash receipt — the helper has its own renderer. */
export interface LoadReceiptPayload {
  storeName: string;
  address: string;
  phone: string;
  footer: string;
  currencySymbol: string;
  transaction: LoadTransaction;
}

/** One line on a low-stock report — frozen at print time so the
 *  paper output stays consistent even if stock moves underneath. */
export interface LowStockRow {
  name: string;
  stock: number;
  cost: number;
}

/** Operational restocking report. Two sections: OUT OF STOCK (sorted
 *  by name) then LOW STOCK (sorted by remaining stock ascending so
 *  the most urgent shows first). Built client-side from the already-
 *  loaded product + category signals — no new backend endpoint. */
export interface LowStockReportPayload {
  storeName: string;
  address: string;
  phone: string;
  footer: string;
  currencySymbol: string;
  /** ISO timestamp at which the snapshot was taken. */
  generatedAt: string;
  /** Admin who pressed print — surfaces on the paper for audit. */
  generatedByName: string;
  outOfStock: ReadonlyArray<LowStockRow>;
  lowStock: ReadonlyArray<LowStockRow>;
}

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

  /**
   * Print the end-of-day Z-report. Prefers the helper service so the
   * report comes out as a single silent ESC/POS print like a regular
   * receipt. When the helper is offline or disabled, falls back to a
   * browser print of a hidden .print-receipt DOM with equivalent
   * content — the cashier sees Chrome's preview but the report still
   * lands on paper.
   */
  /**
   * Print a credit-payment receipt. Helper-first (silent ESC/POS)
   * with a browser-print fallback so registers without the helper
   * still produce paper. Failure on either path snackbars upstream;
   * here we just log and move on.
   */
  async printCreditPayment(payload: CreditPaymentReceiptPayload): Promise<void> {
    if (this._helperEnabled() && this._helperUrl()) {
      const ok = await this.postToHelper('/print-credit-payment', payload);
      if (ok) return;
      console.warn('[printer] helper unreachable for credit payment — falling back to browser');
    }
    this.printCreditPaymentBrowser(payload);
  }

  async printZReport(payload: ZReportPayload): Promise<void> {
    if (this._helperEnabled() && this._helperUrl()) {
      const ok = await this.postToHelper('/print-zreport', payload);
      if (ok) return;
      console.warn('[printer] helper unreachable for Z-report — falling back to browser print');
    }
    this.printZReportBrowser(payload);
  }

  /**
   * Print a GCash service receipt. Three-step fallback:
   *  1. POST /print-gcash — dedicated endpoint, best formatting
   *     ("GCASH CASH-IN" header, phone/inbound-ref lines).
   *  2. POST /print — generic endpoint, present in every helper
   *     version. Renders the transaction as a synthetic two-line
   *     sale ("Amount" + "Service fee") so a helper binary that
   *     pre-dates the GCash feature still prints silently instead
   *     of triggering the browser dialog.
   *  3. Browser print of the rendered .print-receipt DOM.
   *
   * The second step is the important one — without it, an older
   * running helper produces a 404 on /print-gcash and the receipt
   * falls all the way through to window.print() with its dialog +
   * tiny 11px CSS. Restart the helper to get step 1 instead.
   */
  async printGcashTransaction(payload: GcashReceiptPayload): Promise<void> {
    if (this._helperEnabled() && this._helperUrl()) {
      if (await this.postToHelper('/print-gcash', payload)) return;
      if (await this.postToHelper('/print', this.gcashToReceiptPayload(payload))) return;
      console.warn('[printer] helper unreachable for GCash — falling back to browser');
    }
    this.printGcashBrowser(payload);
  }

  /**
   * Convert a GCash receipt payload into the generic ReceiptPayload
   * shape the /print endpoint understands. Loses the GCash-specific
   * header and the "Customer paid / received" grand-total label,
   * but preserves the reference, cashier, amount + fee breakdown,
   * and notes so it's still operationally useful as a fallback.
   */
  private gcashToReceiptPayload(p: GcashReceiptPayload): ReceiptPayload {
    const t = p.transaction;
    const label = t.type === 'CASH_IN' ? 'GCASH CASH-IN' : 'GCASH CASH-OUT';
    const lines: Array<{ name: string; quantity: number; lineTotal: number }> = [
      { name: 'Amount', quantity: 1, lineTotal: t.amount },
    ];
    if (t.fee > 0) lines.push({ name: 'Service fee', quantity: 1, lineTotal: t.fee });
    return {
      storeName: p.storeName,
      address: p.address,
      phone: p.phone,
      saleId: t.reference,
      date: t.date,
      cashierName: t.cashierName,
      paymentMethod: label,
      lines,
      subtotal: t.amount + t.fee,
      lineDiscountTotal: 0,
      orderDiscountAmount: 0,
      tax: 0,
      total: t.amount + t.fee,
      currencySymbol: p.currencySymbol,
      footer: p.footer,
    };
  }

  private printGcashBrowser(payload: GcashReceiptPayload): void {
    const win = this.document.defaultView;
    if (!win) return;
    const container = this.document.createElement('section');
    container.className = 'print-receipt';
    container.innerHTML = this.renderGcashHtml(payload);
    this.document.body.appendChild(container);
    try {
      win.print();
    } finally {
      container.remove();
    }
  }

  /**
   * Print a load receipt. Same three-step fallback as
   * {@link printGcashTransaction}: dedicated /print-load first,
   * then generic /print with a synthesized ReceiptPayload (so an
   * older helper binary that pre-dates the load feature still
   * prints silently), then browser as the last resort.
   */
  async printLoadTransaction(payload: LoadReceiptPayload): Promise<void> {
    if (this._helperEnabled() && this._helperUrl()) {
      if (await this.postToHelper('/print-load', payload)) return;
      if (await this.postToHelper('/print', this.loadToReceiptPayload(payload))) return;
      console.warn('[printer] helper unreachable for load — falling back to browser');
    }
    this.printLoadBrowser(payload);
  }

  /**
   * Convert a load receipt payload into the generic ReceiptPayload
   * shape. Carries the promo into the cashier-name slot when
   * present (a known compromise — the generic renderer doesn't
   * have a dedicated promo field; surfacing it on the receipt is
   * worth the slight semantic stretch).
   */
  private loadToReceiptPayload(p: LoadReceiptPayload): ReceiptPayload {
    const t = p.transaction;
    const lines: Array<{ name: string; quantity: number; lineTotal: number }> = [
      { name: t.promo ? `Load · ${t.promo}` : 'Load', quantity: 1, lineTotal: t.amount },
    ];
    if (t.fee > 0) lines.push({ name: 'Service fee', quantity: 1, lineTotal: t.fee });
    return {
      storeName: p.storeName,
      address: p.address,
      phone: p.phone,
      saleId: t.reference,
      date: t.date,
      cashierName: t.cashierName,
      paymentMethod: `LOAD · ${t.customerPhone}`,
      lines,
      subtotal: t.amount + t.fee,
      lineDiscountTotal: 0,
      orderDiscountAmount: 0,
      tax: 0,
      total: t.amount + t.fee,
      currencySymbol: p.currencySymbol,
      footer: p.footer,
    };
  }

  private printLoadBrowser(payload: LoadReceiptPayload): void {
    const win = this.document.defaultView;
    if (!win) return;
    const container = this.document.createElement('section');
    container.className = 'print-receipt';
    container.innerHTML = this.renderLoadHtml(payload);
    this.document.body.appendChild(container);
    try {
      win.print();
    } finally {
      container.remove();
    }
  }

  private renderLoadHtml(p: LoadReceiptPayload): string {
    const t = p.transaction;
    const money = (v: number | null | undefined) =>
      `${p.currencySymbol}${Number(v ?? 0).toFixed(2)}`;
    const esc = (s: string | null | undefined) =>
      String(s ?? '').replace(/[&<>]/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;',
      );
    const date = t.date ? new Date(t.date).toLocaleString() : '—';
    const total = Number(t.amount) + Number(t.fee);
    return `
      <header class="receipt__header">
        <strong>${esc(p.storeName)}</strong>
        ${p.address ? `<small>${esc(p.address)}</small>` : ''}
        ${p.phone ? `<small>${esc(p.phone)}</small>` : ''}
        <strong>CELLPHONE LOAD</strong>
      </header>
      <hr/>
      <div class="receipt__meta">
        <div>Ref     : ${esc(t.reference)}</div>
        <div>Date    : ${esc(date)}</div>
        <div>Cashier : ${esc(t.cashierName)}</div>
        <div>Phone   : ${esc(t.customerPhone)}</div>
        ${t.promo ? `<div>Promo   : ${esc(t.promo)}</div>` : ''}
      </div>
      <hr/>
      <div class="receipt__row"><span>Amount</span><span>${money(t.amount)}</span></div>
      <div class="receipt__row"><span>Service fee</span><span>${money(t.fee)}</span></div>
      <hr/>
      <div class="receipt__row receipt__row--grand">
        <span>Customer paid</span><span>${money(total)}</span>
      </div>
      ${t.notes ? `<hr/><div class="receipt__notes"><strong>Notes:</strong> ${esc(t.notes)}</div>` : ''}
      <hr/>
      <div>Customer : ____________________</div>
      ${p.footer ? `<footer class="receipt__footer">${esc(p.footer).replace(/\n/g, '<br/>')}</footer>` : ''}
    `;
  }

  private renderGcashHtml(p: GcashReceiptPayload): string {
    const t = p.transaction;
    const money = (v: number | null | undefined) =>
      `${p.currencySymbol}${Number(v ?? 0).toFixed(2)}`;
    const esc = (s: string | null | undefined) =>
      String(s ?? '').replace(/[&<>]/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;',
      );
    const date = t.date ? new Date(t.date).toLocaleString() : '—';
    const label = t.type === 'CASH_IN' ? 'GCASH CASH-IN' : 'GCASH CASH-OUT';
    const total = Number(t.amount) + Number(t.fee);
    return `
      <header class="receipt__header">
        <strong>${esc(p.storeName)}</strong>
        ${p.address ? `<small>${esc(p.address)}</small>` : ''}
        ${p.phone ? `<small>${esc(p.phone)}</small>` : ''}
        <strong>${label}</strong>
      </header>
      <hr/>
      <div class="receipt__meta">
        <div>Ref     : ${esc(t.reference)}</div>
        <div>Date    : ${esc(date)}</div>
        <div>Cashier : ${esc(t.cashierName)}</div>
        ${t.customerName ? `<div>Name    : ${esc(t.customerName)}</div>` : ''}
        ${t.customerPhone ? `<div>Phone   : ${esc(t.customerPhone)}</div>` : ''}
        ${t.inboundRef ? `<div>GCash ref: ${esc(t.inboundRef)}</div>` : ''}
      </div>
      <hr/>
      <div class="receipt__row"><span>Amount</span><span>${money(t.amount)}</span></div>
      <div class="receipt__row"><span>Service fee</span><span>${money(t.fee)}</span></div>
      <hr/>
      <div class="receipt__row receipt__row--grand">
        <span>${t.type === 'CASH_IN' ? 'Customer paid' : 'Customer received'}</span>
        <span>${money(t.type === 'CASH_IN' ? total : t.amount - t.fee)}</span>
      </div>
      ${t.notes ? `<hr/><div class="receipt__notes"><strong>Notes:</strong> ${esc(t.notes)}</div>` : ''}
      <hr/>
      <div>Customer : ____________________</div>
      ${p.footer ? `<footer class="receipt__footer">${esc(p.footer).replace(/\n/g, '<br/>')}</footer>` : ''}
    `;
  }

  /**
   * Print a low-stock restocking report. Helper-first with a browser
   * fallback so registers without the helper still get paper. The
   * payload is a frozen snapshot — caller pre-sorts each section and
   * the helper renders exactly what it was given.
   */
  async printLowStockReport(payload: LowStockReportPayload): Promise<void> {
    if (this._helperEnabled() && this._helperUrl()) {
      const ok = await this.postToHelper('/print-low-stock', payload);
      if (ok) return;
      console.warn('[printer] helper unreachable for low-stock — falling back to browser');
    }
    this.printLowStockBrowser(payload);
  }

  private printLowStockBrowser(payload: LowStockReportPayload): void {
    const win = this.document.defaultView;
    if (!win) return;
    const container = this.document.createElement('section');
    container.className = 'print-receipt';
    container.innerHTML = this.renderLowStockHtml(payload);
    this.document.body.appendChild(container);
    try {
      win.print();
    } finally {
      container.remove();
    }
  }

  private renderLowStockHtml(p: LowStockReportPayload): string {
    const money = (v: number | null | undefined) =>
      `${p.currencySymbol}${Number(v ?? 0).toFixed(2)}`;
    const esc = (s: string | null | undefined) =>
      String(s ?? '').replace(/[&<>]/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;',
      );
    const date = new Date(p.generatedAt).toLocaleString();
    const renderSection = (title: string, rows: ReadonlyArray<LowStockRow>) => {
      if (rows.length === 0) return '';
      // Per row: name + stock, then cost right-aligned, then an
      // <hr/> separator between rows. Matches the ESC/POS layout.
      const lines = rows
        .map(
          (r) =>
            `<div class="receipt__row">
               <span>${esc(r.name)}</span>
               <span>${r.stock}</span>
             </div>
             <div class="receipt__row receipt__row--sub">
               <span></span>
               <span>${money(r.cost)}</span>
             </div>
             <hr/>`,
        )
        .join('');
      return `<div class="receipt__section"><strong>${title} (${rows.length})</strong></div>${lines}`;
    };
    return `
      <header class="receipt__header">
        <strong>${esc(p.storeName)}</strong>
        ${p.address ? `<small>${esc(p.address)}</small>` : ''}
        ${p.phone ? `<small>${esc(p.phone)}</small>` : ''}
        <strong>LOW STOCK REPORT</strong>
      </header>
      <hr/>
      <div class="receipt__meta">
        <div>Date    : ${esc(date)}</div>
        <div>By      : ${esc(p.generatedByName)}</div>
      </div>
      <hr/>
      ${renderSection('OUT OF STOCK', p.outOfStock)}
      ${renderSection('LOW STOCK', p.lowStock)}
      <div class="receipt__row receipt__row--grand">
        <span>Total items</span>
        <span>${p.outOfStock.length + p.lowStock.length}</span>
      </div>
      <hr/>
      <div>Restocked by: ____________________</div>
      ${p.footer ? `<footer class="receipt__footer">${esc(p.footer).replace(/\n/g, '<br/>')}</footer>` : ''}
    `;
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

  /** Browser fallback for {@link printCreditPayment}. */
  private printCreditPaymentBrowser(payload: CreditPaymentReceiptPayload): void {
    const win = this.document.defaultView;
    if (!win) return;
    const container = this.document.createElement('section');
    container.className = 'print-receipt';
    container.innerHTML = this.renderCreditPaymentHtml(payload);
    this.document.body.appendChild(container);
    try {
      win.print();
    } finally {
      container.remove();
    }
  }

  private renderCreditPaymentHtml(p: CreditPaymentReceiptPayload): string {
    const money = (v: number | null | undefined) =>
      `${p.currencySymbol}${Number(v ?? 0).toFixed(2)}`;
    const esc = (s: string | null | undefined) =>
      String(s ?? '').replace(/[&<>]/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;',
      );
    const date = p.payment.date ? new Date(p.payment.date).toLocaleString() : '—';
    return `
      <header class="receipt__header">
        <strong>${esc(p.storeName)}</strong>
        ${p.address ? `<small>${esc(p.address)}</small>` : ''}
        ${p.phone ? `<small>${esc(p.phone)}</small>` : ''}
        <strong>CREDIT PAYMENT RECEIPT</strong>
      </header>
      <hr/>
      <div class="receipt__meta">
        <div>Ref     : ${esc(p.payment.reference)}</div>
        <div>Date    : ${esc(date)}</div>
        <div>From    : ${esc(p.payment.creditorName)}</div>
        <div>Cashier : ${esc(p.payment.cashierName)}</div>
        <div>Method  : ${esc(p.payment.paymentMethod)}</div>
      </div>
      <hr/>
      <div class="receipt__row receipt__row--grand">
        <span>Amount paid</span><span>${money(p.payment.amount)}</span>
      </div>
      <hr/>
      <div class="receipt__row"><span>Balance before</span><span>${money(p.balanceBefore)}</span></div>
      <div class="receipt__row"><span>Balance after</span><span>${money(p.balanceAfter)}</span></div>
      ${p.payment.notes ? `<hr/><div class="receipt__notes"><strong>Notes:</strong> ${esc(p.payment.notes)}</div>` : ''}
      <hr/>
      <div>Received by: ____________________</div>
      <div>Customer  : ____________________</div>
      ${p.footer ? `<footer class="receipt__footer">${esc(p.footer).replace(/\n/g, '<br/>')}</footer>` : ''}
    `;
  }

  /**
   * Browser fallback for {@link printZReport}. Builds a hidden
   * .print-receipt subtree with the report content, prints it, then
   * removes it on the next tick. Same trick as {@link testPrint}.
   */
  private printZReportBrowser(payload: ZReportPayload): void {
    const win = this.document.defaultView;
    if (!win) return;
    const container = this.document.createElement('section');
    container.className = 'print-receipt';
    container.innerHTML = this.renderZReportHtml(payload);
    this.document.body.appendChild(container);
    try {
      win.print();
    } finally {
      container.remove();
    }
  }

  /** Build the HTML for the browser Z-report fallback. Mirrors the
   *  ESC/POS layout from print-helper's renderZReport so paper output
   *  looks the same whichever path the cashier uses. */
  private renderZReportHtml(p: ZReportPayload): string {
    const d = p.day;
    const money = (v: number | null | undefined) =>
      `${p.currencySymbol}${Number(v ?? 0).toFixed(2)}`;
    const esc = (s: string | null | undefined) =>
      String(s ?? '').replace(/[&<>]/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;',
      );
    const opened = d.openedAt ? new Date(d.openedAt).toLocaleString() : '—';
    const closed = d.closedAt ? new Date(d.closedAt).toLocaleString() : '—';
    const variance = Number(d.variance ?? 0);
    const varSign = variance > 0 ? '+' : '';
    const row = (label: string, value: string, grand = false) =>
      `<div class="receipt__row${grand ? ' receipt__row--grand' : ''}">` +
      `<span>${label}</span><span>${value}</span></div>`;
    const refundsRow =
      Number(d.totalRefunds ?? 0) > 0 ? row('Refunds', `-${money(d.totalRefunds)}`) : '';
    const cashRefundsRow =
      Number(d.cashRefunds ?? 0) > 0 ? row('− Cash refunds', money(d.cashRefunds)) : '';
    const cashCreditRow =
      Number(d.cashCreditPayments ?? 0) > 0
        ? row('+ Credit pay (cash)', money(d.cashCreditPayments))
        : '';
    const gcashSalesBlock =
      Number(d.gcashCashInAmount ?? 0) > 0 || Number(d.gcashCashOutAmount ?? 0) > 0
        ? row('GCash cash-in', money(d.gcashCashInAmount)) +
          row('GCash cash-out', money(d.gcashCashOutAmount)) +
          (Number(d.gcashCashInFees ?? 0) + Number(d.gcashCashOutFees ?? 0) > 0
            ? row(
                'GCash fees',
                money(Number(d.gcashCashInFees ?? 0) + Number(d.gcashCashOutFees ?? 0)),
              )
            : '')
        : '';
    const loadSalesBlock =
      Number(d.loadAmount ?? 0) > 0
        ? row('Load', money(d.loadAmount)) +
          (Number(d.loadFees ?? 0) > 0 ? row('Load fees', money(d.loadFees)) : '')
        : '';
    const gcashDrawerBlock =
      (Number(d.gcashCashInAmount ?? 0) > 0
        ? row('+ GCash cash-in', money(d.gcashCashInAmount))
        : '') +
      (Number(d.gcashCashInFees ?? 0) > 0
        ? row('+ GCash in fees', money(d.gcashCashInFees))
        : '') +
      (Number(d.gcashCashOutFees ?? 0) > 0
        ? row('+ GCash out fees', money(d.gcashCashOutFees))
        : '') +
      (Number(d.gcashCashOutAmount ?? 0) > 0
        ? row('− GCash cash-out', money(d.gcashCashOutAmount))
        : '');
    const loadDrawerBlock =
      (Number(d.loadAmount ?? 0) > 0
        ? row('+ Load amount', money(d.loadAmount))
        : '') +
      (Number(d.loadFees ?? 0) > 0
        ? row('+ Load fees', money(d.loadFees))
        : '');
    const varianceBanner =
      variance !== 0
        ? `<div class="receipt__center"><strong>${variance > 0 ? '** OVER expected **' : '** SHORT vs expected **'}</strong></div>`
        : '';
    const notes = d.notes
      ? `<div class="receipt__notes"><strong>Notes:</strong> ${esc(d.notes)}</div>`
      : '';
    return `
      <header class="receipt__header">
        <strong>${esc(p.storeName)}</strong>
        ${p.address ? `<small>${esc(p.address)}</small>` : ''}
        ${p.phone ? `<small>${esc(p.phone)}</small>` : ''}
        <strong>Z-REPORT (End of Day)</strong>
      </header>
      <hr/>
      <div class="receipt__meta">
        <div>Opened: ${esc(opened)}${d.openedByName ? ` — ${esc(d.openedByName)}` : ''}</div>
        <div>Closed: ${esc(closed)}${d.closedByName ? ` — ${esc(d.closedByName)}` : ''}</div>
      </div>
      <hr/>
      <div class="receipt__section"><strong>SALES</strong></div>
      ${row('Transactions', String(d.salesCount ?? 0))}
      ${row('Items sold', String(d.itemsSold ?? 0))}
      ${row('Cash', money(d.cashSales))}
      ${row('Card', money(d.cardSales))}
      ${row('Transfer', money(d.transferSales))}
      ${Number(d.creditSales ?? 0) > 0 ? row('Credit', money(d.creditSales)) : ''}
      ${gcashSalesBlock}
      ${loadSalesBlock}
      ${row('TOTAL SALES', money(d.totalSales), true)}
      ${refundsRow}
      <hr/>
      <div class="receipt__section"><strong>CASH DRAWER</strong></div>
      ${row('Opening float', money(d.openingFloat))}
      ${Number(d.floatAdditions ?? 0) > 0 ? row('+ Float top-ups', money(d.floatAdditions)) : ''}
      ${row('+ Cash sales', money(d.cashSales))}
      ${cashCreditRow}
      ${gcashDrawerBlock}
      ${loadDrawerBlock}
      ${cashRefundsRow}
      ${row('Expected cash', money(d.expectedCash))}
      ${row('Counted cash', money(d.countedCash))}
      ${row('Variance', `${varSign}${money(d.variance)}`, true)}
      ${varianceBanner}
      ${notes}
      <hr/>
      <div>Closed by: ____________________</div>
      <div>Verified : ____________________</div>
      ${p.footer ? `<footer class="receipt__footer">${esc(p.footer).replace(/\n/g, '<br/>')}</footer>` : ''}
    `;
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
