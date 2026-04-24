import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import type { BarcodeScannerDialog } from '../../shared/dialogs/barcode-scanner-dialog';

/**
 * Wrapper around the camera-based {@link BarcodeScannerDialog}. Dynamically
 * imports the dialog so the ~200 KB zxing library stays out of the main
 * bundle — only downloads the first time a cashier taps a scan button.
 *
 * Returns the decoded string, or `null` if the user dismissed the dialog
 * / the camera was unavailable. Callers should fall back to manual entry
 * when null is returned.
 */
@Injectable({ providedIn: 'root' })
export class BarcodeScannerService {
  private readonly dialog = inject(MatDialog);

  /** True on browsers that at least expose getUserMedia (most modern mobile). */
  readonly isSupported =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function';

  async scan(): Promise<string | null> {
    if (!this.isSupported) return null;

    const { BarcodeScannerDialog } = await import(
      '../../shared/dialogs/barcode-scanner-dialog'
    );

    const ref = this.dialog.open<BarcodeScannerDialog, void, string | null>(
      BarcodeScannerDialog,
      {
        // Full-screen on mobile, generous scaled dialog on desktop. The
        // dialog-fullscreen-mobile global rule zeroes the panel radius
        // and sets the surface to 100 dvh.
        width: '520px',
        maxWidth: '100vw',
        height: '100%',
        maxHeight: '100vh',
        panelClass: ['dialog-fullscreen-mobile', 'barcode-scanner-panel'],
        autoFocus: false,
        restoreFocus: true,
      },
    );
    return firstValueFrom(ref.afterClosed()).then((r) => r ?? null);
  }
}
