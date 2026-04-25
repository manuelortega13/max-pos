import {
  DestroyRef,
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnInit,
  Output,
  inject,
} from '@angular/core';

/**
 * Trigger distance (px) at which the refresh fires on release. Below this
 * the gesture is treated as an accidental pull and snaps back.
 */
const PULL_THRESHOLD = 72;
/** Cap on the visual pull distance so the spinner doesn't chase the finger. */
const MAX_PULL = 130;
/** Damping factor — makes the pull feel elastic instead of 1:1 with the finger. */
const DAMPING = 0.55;

/**
 * Facebook / TikTok-style pull-to-refresh on a scrollable container.
 * Shows a floating spinner that tracks the finger as the user drags down
 * from `scrollTop === 0`, emits `refresh` when released past the threshold,
 * and hides the spinner when the parent flips `refreshing` back to false.
 *
 * Usage:
 *   <main appPullToRefresh [refreshing]="syncing()" (refresh)="onRefresh()">
 *     …scrollable content…
 *   </main>
 *
 * The host element MUST be the actual scroll container (`overflow-y: auto`)
 * for the `scrollTop === 0` gating to work.
 */
@Directive({
  selector: '[appPullToRefresh]',
  standalone: true,
})
export class PullToRefreshDirective implements OnInit {
  /**
   * Parent sets this to true while a refresh is in flight; false when done.
   *
   * Angular applies @Input bindings before ngOnInit, so this setter can
   * fire *before* `this.indicator` is created. Touching `indicator.style`
   * in that window throws and kills the entire host's template render —
   * e.g. on the cashier layout it blanks the POS on first load. Store
   * the latest value and let ngOnInit apply it once the indicator exists.
   */
  @Input() set refreshing(value: boolean) {
    this._refreshing = value;
    if (!this.indicator) return;
    if (value) {
      this.setIndicatorLoading();
    } else {
      this.hideIndicator();
    }
  }
  /** Kill-switch — useful if the container is non-scrollable on desktop. */
  @Input() ptrDisabled = false;

  @Output() refresh = new EventEmitter<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  private startY = 0;
  private lastY = 0;
  private pulling = false;
  private _refreshing = false;
  private indicator!: HTMLElement;
  private scrollEl: HTMLElement | null = null;

  ngOnInit(): void {
    this.indicator = this.makeIndicator();
    document.body.appendChild(this.indicator);
    // If the parent set `refreshing=true` before ngOnInit ran, the setter
    // bailed out early — apply that state now.
    if (this._refreshing) this.setIndicatorLoading();

    // The host isn't necessarily the real scroll container (e.g. admin
    // layout uses <mat-sidenav-content> as the scroller and <main> is
    // non-scrollable). Walk up to find the actual one — that's what we
    // need to check scrollTop on.
    this.scrollEl = this.findScrollContainer(this.host.nativeElement);
    // Stop the browser's native overscroll bounce from eating the gesture.
    if (this.scrollEl && this.scrollEl !== document.documentElement) {
      this.scrollEl.style.overscrollBehaviorY = 'contain';
    }

    // Touch handling runs outside Angular — we only re-enter the zone when
    // actually emitting refresh, so move/end don't trigger change detection
    // on every frame.
    this.zone.runOutsideAngular(() => {
      const el = this.host.nativeElement;
      el.addEventListener('touchstart', this.onStart, { passive: true });
      el.addEventListener('touchmove', this.onMove, { passive: false });
      el.addEventListener('touchend', this.onEnd, { passive: true });
      el.addEventListener('touchcancel', this.onEnd, { passive: true });
    });

    this.destroyRef.onDestroy(() => {
      const el = this.host.nativeElement;
      el.removeEventListener('touchstart', this.onStart);
      el.removeEventListener('touchmove', this.onMove);
      el.removeEventListener('touchend', this.onEnd);
      el.removeEventListener('touchcancel', this.onEnd);
      this.indicator.remove();
    });
  }

  private onStart = (e: TouchEvent): void => {
    if (this.ptrDisabled || this._refreshing) {
      this.pulling = false;
      return;
    }
    // If the touch starts inside a nested scroll container (e.g. the
    // POS page's product grid or cart panel, which own their own
    // overflow-y:auto), those events belong to that container —
    // engaging the pull would preventDefault its touchmove and make
    // the inner scroll unusable.
    if (this.isInsideInnerScroll(e.target as HTMLElement | null)) {
      this.pulling = false;
      return;
    }
    const top = this.scrollEl?.scrollTop ?? 0;
    if (top > 0) {
      this.pulling = false;
      return;
    }
    this.startY = e.touches[0].clientY;
    this.lastY = this.startY;
    this.pulling = true;
  };

  /**
   * Walk up from the touch target. If we hit a scrollable ancestor
   * before reaching scrollEl, the touch is inside a nested scroller
   * and we should stay out of its way.
   */
  private isInsideInnerScroll(target: HTMLElement | null): boolean {
    let el: HTMLElement | null = target;
    while (el && el !== this.scrollEl && el !== document.body) {
      const s = getComputedStyle(el);
      if (
        (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight
      ) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  private onMove = (e: TouchEvent): void => {
    if (!this.pulling) return;
    this.lastY = e.touches[0].clientY;
    const delta = this.lastY - this.startY;
    if (delta <= 0) {
      this.hideIndicator();
      return;
    }
    const damped = Math.min(MAX_PULL, delta * DAMPING);
    // Only preventDefault once we're clearly pulling; lets the first few
    // pixels still act as normal scroll if the user was really scrolling.
    if (damped > 4 && e.cancelable) e.preventDefault();
    this.showIndicator(damped);
  };

  private onEnd = (): void => {
    if (!this.pulling) return;
    this.pulling = false;
    const damped = Math.min(MAX_PULL, (this.lastY - this.startY) * DAMPING);
    if (damped >= PULL_THRESHOLD && !this._refreshing) {
      this._refreshing = true;
      this.setIndicatorLoading();
      // Re-enter the zone so downstream signal writes + HTTP calls trigger
      // change detection normally.
      this.zone.run(() => this.refresh.emit());
    } else {
      this.hideIndicator();
    }
  };

  /**
   * Walk up from the host looking for an ancestor that's *declared* to
   * scroll vertically. Crucially, we do NOT also require
   * `scrollHeight > clientHeight` here — at ngOnInit the route's content
   * hasn't rendered yet so the host appears non-overflowing, and the
   * old check made us walk past <main> all the way up to documentElement.
   * That was the actual bug: documentElement.scrollTop is permanently 0
   * because body/html don't scroll in this layout, so the "are we at
   * top?" gate evaluated true forever and PTR blocked every scroll-up
   * gesture once you'd scrolled down.
   * Falls back to documentElement only if no overflow ancestor exists.
   */
  private findScrollContainer(start: HTMLElement): HTMLElement {
    let el: HTMLElement | null = start;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if (s.overflowY === 'auto' || s.overflowY === 'scroll') {
        return el;
      }
      el = el.parentElement;
    }
    return document.documentElement;
  }

  private makeIndicator(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'app-ptr';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="app-ptr__spinner"></div>';
    el.style.transform = `translate(-50%, -64px)`;
    el.style.opacity = '0';
    return el;
  }

  private showIndicator(distance: number): void {
    // Translate from above the viewport down to `distance` px from the top.
    this.indicator.style.transition = 'none';
    this.indicator.style.transform = `translate(-50%, ${distance - 40}px) rotate(${distance * 3}deg)`;
    this.indicator.style.opacity = String(Math.min(1, distance / PULL_THRESHOLD));
    this.indicator.classList.remove('app-ptr--loading');
  }

  private setIndicatorLoading(): void {
    this.indicator.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
    this.indicator.style.transform = 'translate(-50%, 24px)';
    this.indicator.style.opacity = '1';
    this.indicator.classList.add('app-ptr--loading');
  }

  private hideIndicator(): void {
    this.indicator.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
    this.indicator.style.transform = 'translate(-50%, -64px)';
    this.indicator.style.opacity = '0';
    this.indicator.classList.remove('app-ptr--loading');
  }
}
