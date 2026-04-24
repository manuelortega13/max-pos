import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';

type ScannerState = 'initializing' | 'scanning' | 'detected' | 'error';

/**
 * Mobile-first camera barcode scanner. Uses @zxing/browser to decode any
 * 1D/2D code from a live video feed. Dismisses with the decoded string on
 * the first read, or `null` if the user closes manually.
 *
 * Loaded via dynamic import from {@link BarcodeScannerService} so neither
 * this component nor its ~200 KB zxing payload ends up in the main bundle.
 */
@Component({
  selector: 'app-barcode-scanner-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './barcode-scanner-dialog.html',
  styleUrl: './barcode-scanner-dialog.scss',
})
export class BarcodeScannerDialog implements AfterViewInit, OnDestroy {
  protected readonly dialogRef = inject(
    MatDialogRef<BarcodeScannerDialog, string | null>,
  );

  protected readonly state = signal<ScannerState>('initializing');
  protected readonly errorMessage = signal<string>('');
  protected readonly torchSupported = signal<boolean>(false);
  protected readonly torchOn = signal<boolean>(false);
  protected readonly canSwitchCamera = signal<boolean>(false);

  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');
  private reader: BrowserMultiFormatReader | null = null;
  private controls: IScannerControls | null = null;
  private devices: MediaDeviceInfo[] = [];
  private deviceIdx = 0;

  async ngAfterViewInit(): Promise<void> {
    await this.start();
  }

  ngOnDestroy(): void {
    try { this.controls?.stop(); } catch { /* already torn down */ }
  }

  private async start(deviceId?: string): Promise<void> {
    const video = this.videoRef()?.nativeElement;
    if (!video) return;

    this.state.set('initializing');
    try {
      // Trigger the permission prompt with a probe stream so we can fall
      // back to a clear message if the user denies. Without this, zxing's
      // internal getUserMedia call throws a harder-to-diagnose error.
      const probe = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      probe.getTracks().forEach((t) => t.stop());

      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      if (devices.length === 0) {
        this.setError('No camera found on this device.');
        return;
      }
      this.devices = devices;
      this.canSwitchCamera.set(devices.length > 1);

      // Heuristic: pick the rear camera when labels are available. On iOS
      // labels are present only after permission; this is why we probe
      // above. Falls back to first listed camera if no label match.
      if (!deviceId) {
        const rear = devices.findIndex((d) => /back|environment|rear/i.test(d.label));
        this.deviceIdx = rear >= 0 ? rear : 0;
        deviceId = devices[this.deviceIdx].deviceId;
      }

      // TRY_HARDER makes zxing attempt orthogonal rotations on 1D barcodes
      // — critical for a cashier scanning a barcode that's vertical on the
      // package, or when the phone is held sideways. Without it, only the
      // original left→right row scanline is tried and vertical codes never
      // resolve. `delayBetweenScanAttempts` at 120ms gives a snappy live
      // preview without pegging CPU on older phones.
      const hints = new Map<DecodeHintType, unknown>();
      hints.set(DecodeHintType.TRY_HARDER, true);
      this.reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 120,
      });
      this.controls = await this.reader.decodeFromVideoDevice(
        deviceId,
        video,
        (result, _err, controls) => {
          if (result) {
            controls.stop();
            this.onDetected(result.getText());
          }
        },
      );

      this.state.set('scanning');
      this.detectTorchSupport(video);
    } catch (err) {
      console.warn('[barcode-scanner] start failed', err);
      const name = (err as { name?: string }).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        this.setError('Camera access was denied. Enable it in your browser settings and try again.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        this.setError('No camera found on this device.');
      } else if (name === 'NotReadableError') {
        this.setError('Another app is using the camera. Close it and retry.');
      } else {
        this.setError('Could not start the camera.');
      }
    }
  }

  private onDetected(code: string): void {
    this.state.set('detected');
    // Short haptic buzz + brief visual confirmation before closing so the
    // user sees the scan succeeded instead of it vanishing instantly.
    try { navigator.vibrate?.(50); } catch { /* non-fatal */ }
    setTimeout(() => this.dialogRef.close(code), 220);
  }

  protected async toggleTorch(): Promise<void> {
    const video = this.videoRef()?.nativeElement;
    const stream = video?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()?.[0];
    if (!track) return;
    const next = !this.torchOn();
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      });
      this.torchOn.set(next);
    } catch {
      // Some devices advertise torch support but reject applyConstraints.
      this.torchSupported.set(false);
    }
  }

  protected async switchCamera(): Promise<void> {
    try { this.controls?.stop(); } catch { /* no-op */ }
    this.deviceIdx = (this.deviceIdx + 1) % this.devices.length;
    await this.start(this.devices[this.deviceIdx].deviceId);
  }

  protected close(): void {
    this.dialogRef.close(null);
  }

  private detectTorchSupport(video: HTMLVideoElement): void {
    try {
      const stream = video.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()?.[0];
      const caps = track?.getCapabilities?.() as
        | (MediaTrackCapabilities & { torch?: boolean })
        | undefined;
      this.torchSupported.set(!!caps?.torch);
    } catch {
      this.torchSupported.set(false);
    }
  }

  private setError(message: string): void {
    this.state.set('error');
    this.errorMessage.set(message);
  }
}
