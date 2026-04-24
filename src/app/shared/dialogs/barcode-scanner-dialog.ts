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
import { HTMLCanvasElementLuminanceSource } from '@zxing/browser';
import {
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  NotFoundException,
} from '@zxing/library';

type ScannerState = 'initializing' | 'scanning' | 'detected' | 'error';

/**
 * Mobile-first camera barcode scanner.
 *
 * Runs its own polling loop instead of @zxing/browser's
 * `decodeFromVideoDevice` so we can rotate every frame through
 * 0°/90°/180°/270° before handing it to the decoder. That gives true
 * any-orientation scanning for 1D barcodes — zxing-js's native
 * TRY_HARDER hint claims to do this but the browser port only reliably
 * handles horizontal scanlines, so vertical / upside-down codes slip
 * past it. QR / Data Matrix / Aztec are orientation-independent by
 * design and benefit from the extra rotations as a side effect.
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

  // One MultiFormatReader reused for every frame. TRY_HARDER still helps a
  // little on top of our manual rotation — it enables reversed scanlines
  // and more aggressive binarization within each individual decode attempt.
  private readonly reader = (() => {
    const r = new MultiFormatReader();
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.TRY_HARDER, true);
    r.setHints(hints);
    return r;
  })();

  // Off-screen canvas for rotated frames. `willReadFrequently` tells the
  // browser to keep the backing buffer CPU-side so the subsequent
  // luminance read (inside HTMLCanvasElementLuminanceSource) is cheap.
  private readonly canvas = document.createElement('canvas');
  private readonly ctx = this.canvas.getContext('2d', {
    willReadFrequently: true,
  });

  // Rotate through orientations across successive frames rather than all
  // four on the same frame. One angle per tick keeps the main thread
  // responsive; the full sweep hits every orientation in well under a
  // second.
  private readonly angles = [0, 90, 180, 270];
  private angleIdx = 0;

  private stream: MediaStream | null = null;
  private devices: MediaDeviceInfo[] = [];
  private deviceIdx = 0;
  private loopHandle: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  async ngAfterViewInit(): Promise<void> {
    await this.start();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopLoop();
    this.stopStream();
  }

  private async start(deviceId?: string): Promise<void> {
    const video = this.videoRef()?.nativeElement;
    if (!video || !this.ctx) return;

    this.state.set('initializing');
    try {
      // Prefer rear camera by default; a specific deviceId wins when the
      // user has switched cameras.
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: { ideal: 'environment' } },
      };
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = this.stream;
      // Some browsers (iOS Safari PWA) need an explicit play() even with
      // the autoplay attribute; ignore a play() rejection because the
      // dialog was opened by a user click so autoplay should already be
      // permitted.
      video.play().catch(() => {
        /* non-fatal — the stream is still live */
      });

      // enumerateDevices only returns labels after permission is granted,
      // which is why we call it post-getUserMedia. Falls back to list
      // order when labels are missing.
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      this.devices = allDevices.filter((d) => d.kind === 'videoinput');
      this.canSwitchCamera.set(this.devices.length > 1);
      if (!deviceId) {
        const rear = this.devices.findIndex((d) =>
          /back|environment|rear/i.test(d.label),
        );
        this.deviceIdx = rear >= 0 ? rear : 0;
      }

      this.state.set('scanning');
      this.detectTorchSupport();
      this.scheduleScan();
    } catch (err) {
      console.warn('[barcode-scanner] start failed', err);
      this.stopStream();
      const name = (err as { name?: string }).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        this.setError(
          'Camera access was denied. Enable it in your browser settings and try again.',
        );
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        this.setError('No camera found on this device.');
      } else if (name === 'NotReadableError') {
        this.setError('Another app is using the camera. Close it and retry.');
      } else {
        this.setError('Could not start the camera.');
      }
    }
  }

  private scheduleScan(): void {
    if (this.destroyed) return;
    // 90 ms between attempts ≈ 11 ticks/sec. Each tick rotates one
    // orientation, so the four-angle sweep completes in ~360 ms — fast
    // enough to feel instant for any orientation of a 1D barcode without
    // starving the video element or pegging CPU on older phones.
    this.loopHandle = setTimeout(() => this.scanOnce(), 90);
  }

  private scanOnce(): void {
    if (this.destroyed) return;
    const video = this.videoRef()?.nativeElement;
    // readyState < HAVE_CURRENT_DATA (2) means the first frame hasn't
    // decoded yet — skip this tick and try again shortly.
    if (!video || video.readyState < 2) {
      this.scheduleScan();
      return;
    }

    const angle = this.angles[this.angleIdx];
    this.angleIdx = (this.angleIdx + 1) % this.angles.length;

    const text = this.tryDecode(video, angle);
    if (text) {
      this.onDetected(text);
      return;
    }
    this.scheduleScan();
  }

  private tryDecode(video: HTMLVideoElement, angle: number): string | null {
    if (!this.ctx) return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === 0 || vh === 0) return null;

    // Downsample — barcodes decode fine at 640 px max edge and the
    // pipeline cost scales with pixel count, so this is a 2-4× win on
    // typical 1280×720 or higher camera streams.
    const TARGET = 640;
    const scale = Math.min(1, TARGET / Math.max(vw, vh));
    const sw = Math.max(1, Math.round(vw * scale));
    const sh = Math.max(1, Math.round(vh * scale));

    const swap = angle === 90 || angle === 270;
    this.canvas.width = swap ? sh : sw;
    this.canvas.height = swap ? sw : sh;

    this.ctx.save();
    this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    this.ctx.rotate((angle * Math.PI) / 180);
    this.ctx.drawImage(video, -sw / 2, -sh / 2, sw, sh);
    this.ctx.restore();

    try {
      const luminance = new HTMLCanvasElementLuminanceSource(this.canvas);
      const bitmap = new BinaryBitmap(new HybridBinarizer(luminance));
      return this.reader.decode(bitmap).getText();
    } catch (err) {
      // Expected miss → NotFoundException / Checksum / Format. Anything
      // else we also treat as a miss to keep the loop going instead of
      // killing the scanner.
      if (!(err instanceof NotFoundException)) {
        /* swallow — next angle / next frame may still land */
      }
      return null;
    } finally {
      // MultiFormatReader caches per-format sub-readers across calls.
      // reset() just clears per-decode scratch so the next frame starts
      // clean.
      try { this.reader.reset(); } catch { /* no-op */ }
    }
  }

  private onDetected(code: string): void {
    this.state.set('detected');
    this.stopLoop();
    try { navigator.vibrate?.(50); } catch { /* non-fatal */ }
    setTimeout(() => this.dialogRef.close(code), 220);
  }

  protected async toggleTorch(): Promise<void> {
    const track = this.stream?.getVideoTracks()?.[0];
    if (!track) return;
    const next = !this.torchOn();
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      });
      this.torchOn.set(next);
    } catch {
      this.torchSupported.set(false);
    }
  }

  protected async switchCamera(): Promise<void> {
    this.stopLoop();
    this.stopStream();
    this.deviceIdx = (this.deviceIdx + 1) % Math.max(1, this.devices.length);
    await this.start(this.devices[this.deviceIdx]?.deviceId);
  }

  protected close(): void {
    this.dialogRef.close(null);
  }

  private stopLoop(): void {
    if (this.loopHandle !== null) {
      clearTimeout(this.loopHandle);
      this.loopHandle = null;
    }
  }

  private stopStream(): void {
    const video = this.videoRef()?.nativeElement;
    if (video) video.srcObject = null;
    this.stream?.getTracks().forEach((t) => {
      try { t.stop(); } catch { /* no-op */ }
    });
    this.stream = null;
  }

  private detectTorchSupport(): void {
    try {
      const track = this.stream?.getVideoTracks()?.[0];
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
