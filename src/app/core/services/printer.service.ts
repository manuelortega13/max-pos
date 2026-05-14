import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

export type PaperSize = '58mm' | '80mm' | 'a4';

const AUTO_PRINT_KEY = 'maxpos.printer.autoPrint';
const PAPER_SIZE_KEY = 'maxpos.printer.paperSize';
const PAGE_STYLE_ID = 'maxpos-printer-page-size';

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

  /** When true, the checkout dialog fires window.print() automatically
   *  the moment the receipt step renders. */
  readonly autoPrint = this._autoPrint.asReadonly();

  /** Paper size — drives the injected @page rule. */
  readonly paperSize = this._paperSize.asReadonly();

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
  }

  setAutoPrint(on: boolean): void {
    this._autoPrint.set(on);
  }

  setPaperSize(size: PaperSize): void {
    this._paperSize.set(size);
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
