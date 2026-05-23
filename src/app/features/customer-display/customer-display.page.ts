import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CustomerDisplayService } from '../../core/services/customer-display.service';

/**
 * Fullscreen customer-facing display. Renders one of three states
 * (idle / active / completed) driven by the cashier's POS tab over
 * the BroadcastChannel-backed {@link CustomerDisplayService}.
 *
 * Designed for a secondary monitor or a second browser window
 * dragged to a customer-facing screen — large typography, no controls,
 * no chrome. The cashier opens this once and then ignores it.
 */
@Component({
  selector: 'app-customer-display-page',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-display.page.html',
  styleUrl: './customer-display.page.scss',
})
export class CustomerDisplayPage implements OnInit, OnDestroy {
  private readonly display = inject(CustomerDisplayService);

  protected readonly state = this.display.state;
  protected readonly now = signal<number>(Date.now());
  /** Ticker drives the time-of-day greeting on the idle screen. */
  private nowTimer: ReturnType<typeof setInterval> | null = null;

  /** "Good morning" / "Good afternoon" / "Good evening" for the idle screen. */
  protected readonly greeting = computed(() => {
    const h = new Date(this.now()).getHours();
    if (h < 5)  return 'Hello';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  });

  /** Total item count for the small badge in the active header. */
  protected readonly itemCount = computed(() => {
    const s = this.state();
    if (s.kind !== 'active') return 0;
    return s.items.reduce((n, i) => n + i.quantity, 0);
  });

  ngOnInit(): void {
    // Ask the cashier tab for its current state so we don't sit on
    // the idle welcome while the cashier already has a cart going.
    this.display.requestInitialState();
    // Recompute the greeting every minute. Cheap; one setInterval.
    this.nowTimer = setInterval(() => this.now.set(Date.now()), 60_000);
  }

  ngOnDestroy(): void {
    if (this.nowTimer !== null) clearInterval(this.nowTimer);
  }

  /** Format a number with the broadcast currency symbol. Doesn't
   *  depend on SettingsService so the display works even on a
   *  secondary tab whose service injection raced the broadcast. */
  protected money(value: number, currency: string): string {
    return `${currency}${value.toFixed(2)}`;
  }
}
