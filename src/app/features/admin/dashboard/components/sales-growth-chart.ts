import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import ApexCharts from 'apexcharts';
import type { ApexOptions } from 'apexcharts';
import { catchError, of, switchMap, tap } from 'rxjs';
import { SalesGrowth } from '../../../../core/models';
import { SaleService } from '../../../../core/services/sale.service';
import { SettingsService } from '../../../../core/services/settings.service';
import { MoneyPipe } from '../../../../shared/pipes/currency-symbol.pipe';

/** Empty series shown before the first fetch resolves. */
const EMPTY_GROWTH: SalesGrowth = { points: [], previousTotal: 0 };

interface DayPoint {
  readonly iso: string;
  readonly value: number;
}

/**
 * Sales-growth widget for the dashboard. Buckets completed sales into a
 * rolling daily revenue series and renders it as an ApexCharts gradient
 * area chart, with a headline total and a growth badge comparing this
 * window to the preceding window of equal length.
 *
 * ApexCharts is driven imperatively (no Angular wrapper) so it stays
 * zoneless-safe: the chart is created/updated/destroyed from a single
 * effect that tracks the data + currency signals, and torn down on
 * destroy. Theme colors are pulled from the live `--mat-sys-*` tokens so
 * the chart tracks the Material theme.
 */
@Component({
  selector: 'app-sales-growth-chart',
  imports: [DecimalPipe, MatCardModule, MatIconModule, MatProgressBarModule, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card appearance="outlined" class="growth">
      <mat-card-header>
        <mat-card-title>Sales growth</mat-card-title>
        <mat-card-subtitle>Daily revenue · last {{ windowDays() }} days</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div class="growth__head">
          <div class="growth__total">
            <span class="growth__total-label">Period revenue</span>
            <span class="growth__total-value">{{ periodTotal() | money }}</span>
          </div>
          @if (growthPct(); as g) {
            <span
              class="growth__badge"
              [class.growth__badge--up]="trendUp()"
              [class.growth__badge--down]="!trendUp()"
            >
              <mat-icon>{{ trendUp() ? 'trending_up' : 'trending_down' }}</mat-icon>
              {{ trendUp() ? '+' : '' }}{{ g * 100 | number: '1.0-1' }}%
              <span class="growth__badge-sub">vs prev {{ windowDays() }}d</span>
            </span>
          } @else {
            <span class="growth__badge growth__badge--flat">
              <mat-icon>trending_flat</mat-icon>
              New
            </span>
          }
        </div>

        <div class="growth__body">
          @if (loading()) {
            <mat-progress-bar mode="indeterminate"></mat-progress-bar>
          }
          @if (hasData()) {
            <div #chartHost class="growth__chart"></div>
          } @else if (loading()) {
            <div class="growth__empty growth__empty--loading">
              <mat-icon>query_stats</mat-icon>
              <p>Loading sales…</p>
            </div>
          } @else {
            <div class="growth__empty">
              <mat-icon>bar_chart</mat-icon>
              <p>No sales in this period yet — ring up a sale to start the trend.</p>
            </div>
          }
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .growth__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 0.25rem;
      }
      .growth__total {
        display: flex;
        flex-direction: column;
      }
      .growth__total-label {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--mat-sys-on-surface-variant);
      }
      .growth__total-value {
        font-size: 1.6rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .growth__badge {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.35rem 0.7rem;
        border-radius: 999px;
        font-size: 0.9rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;

        mat-icon {
          font-size: 1.15rem;
          width: 1.15rem;
          height: 1.15rem;
        }
      }
      .growth__badge-sub {
        font-size: 0.7rem;
        font-weight: 500;
        opacity: 0.75;
      }
      .growth__badge--up {
        background: rgba(16, 185, 129, 0.15);
        color: #047857;
      }
      .growth__badge--down {
        background: rgba(239, 68, 68, 0.15);
        color: #b91c1c;
      }
      .growth__badge--flat {
        background: var(--mat-sys-surface-container);
        color: var(--mat-sys-on-surface-variant);
      }
      .growth__body {
        position: relative;
        /* Reserve a stable height so the chart, loading, and empty states
           all occupy the same space — the card never reflows as data loads. */
        min-height: 16rem;

        /* Overlay the loading bar at the top so toggling it on/off never
           shifts the chart below it. */
        mat-progress-bar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 1;
        }
      }
      .growth__chart {
        width: 100%;
        min-height: 16rem;
      }
      .growth__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        padding: 2rem 1.5rem;
        color: var(--mat-sys-on-surface-variant);
        text-align: center;

        mat-icon {
          font-size: 2.4rem;
          width: 2.4rem;
          height: 2.4rem;
          opacity: 0.6;
        }
        p {
          margin: 0;
        }
      }
    `,
  ],
})
export class SalesGrowthChart {
  private readonly saleService = inject(SaleService);
  private readonly settingsService = inject(SettingsService);
  private readonly hostEl = inject(ElementRef<HTMLElement>);

  /** Length of the rolling window, in days. */
  readonly windowDays = input<number>(14);

  private readonly chartHost = viewChild<ElementRef<HTMLElement>>('chartHost');

  protected readonly currencySymbol = computed(
    () => this.settingsService.settings().currencySymbol,
  );

  /**
   * Pre-aggregated daily revenue from the server (re-fetched when the
   * window length changes), so the chart no longer buckets the whole sales
   * history in the browser.
   */
  private readonly fetching = signal(false);
  /** True while a window's revenue series is in flight. */
  protected readonly loading = this.fetching.asReadonly();

  private readonly data = toSignal(
    toObservable(this.windowDays).pipe(
      switchMap((days) => {
        this.fetching.set(true);
        return this.saleService.salesGrowth(days).pipe(
          catchError(() => of(EMPTY_GROWTH)),
          tap(() => this.fetching.set(false)),
        );
      }),
    ),
    { initialValue: EMPTY_GROWTH },
  );

  /** One point per day across the window, oldest → newest, zero-filled
   *  (the server already zero-fills and orders the series). */
  protected readonly points = computed<DayPoint[]>(() =>
    this.data().points.map((p) => ({ iso: p.date, value: p.total })),
  );

  protected readonly periodTotal = computed(() =>
    this.points().reduce((sum, p) => sum + p.value, 0),
  );

  /** Total of the window immediately preceding the current one. */
  private readonly prevPeriodTotal = computed(() => this.data().previousTotal);

  /** Fractional change vs. the previous window, or null when there's no
   *  prior baseline to grow from (avoids a divide-by-zero "∞%"). */
  protected readonly growthPct = computed<number | null>(() => {
    const prev = this.prevPeriodTotal();
    if (prev <= 0) return null;
    return (this.periodTotal() - prev) / prev;
  });

  protected readonly trendUp = computed(() => (this.growthPct() ?? 0) >= 0);

  protected readonly hasData = computed(() => this.periodTotal() > 0);

  private chart: ApexCharts | null = null;

  constructor() {
    // Single render loop: tracks the data + currency signals (read inside
    // buildOptions) and the chart host element. Creates the chart on
    // first availability, updates it in place afterwards, and destroys it
    // when the host disappears (empty state) so we never leak an instance.
    effect(() => {
      const host = this.chartHost();
      const visible = this.hasData();
      const options = this.buildOptions();

      if (!host || !visible) {
        this.destroyChart();
        return;
      }
      if (this.chart) {
        void this.chart.updateOptions(options, false, true);
      } else {
        this.chart = new ApexCharts(host.nativeElement, options);
        void this.chart.render();
      }
    });

    inject(DestroyRef).onDestroy(() => this.destroyChart());
  }

  private destroyChart(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  /** Resolve a live Material theme token to a usable color string. */
  private token(name: string, fallback: string): string {
    const v = getComputedStyle(this.hostEl.nativeElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  private buildOptions(): ApexOptions {
    const sym = this.currencySymbol();
    const primary = this.token('--mat-sys-primary', '#3b82f6');
    const axis = this.token('--mat-sys-on-surface-variant', '#64748b');
    const grid = this.token('--mat-sys-outline-variant', '#e2e8f0');
    const data = this.points().map((p) => ({ x: p.iso, y: Math.round(p.value * 100) / 100 }));

    const compact = (v: number): string =>
      Math.abs(v) >= 1000 ? `${sym}${(v / 1000).toFixed(1)}k` : `${sym}${Math.round(v)}`;

    return {
      chart: {
        type: 'bar',
        height: 260,
        fontFamily: 'inherit',
        foreColor: axis,
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: true, speed: 450 },
        parentHeightOffset: 0,
        sparkline: { enabled: false },
      },
      series: [{ name: 'Revenue', data }],
      colors: [primary],
      dataLabels: { enabled: false },
      plotOptions: {
        bar: {
          columnWidth: '60%',
          borderRadius: 4,
          borderRadiusApplication: 'end',
        },
      },
      stroke: { show: false },
      fill: {
        type: 'gradient',
        gradient: {
          shade: 'light',
          type: 'vertical',
          shadeIntensity: 0.25,
          opacityFrom: 1,
          opacityTo: 0.85,
          stops: [0, 100],
        },
      },
      states: { hover: { filter: { type: 'darken' } } },
      grid: {
        borderColor: grid,
        strokeDashArray: 4,
        xaxis: { lines: { show: false } },
        padding: { left: 4, right: 4, top: 0, bottom: 0 },
      },
      xaxis: {
        type: 'datetime',
        tooltip: { enabled: false },
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: {
          datetimeUTC: true,
          format: 'dd MMM',
          style: { fontSize: '11px', colors: axis },
        },
      },
      yaxis: {
        labels: {
          formatter: (v: number) => compact(v),
          style: { fontSize: '11px', colors: axis },
        },
        min: 0,
        forceNiceScale: true,
      },
      tooltip: {
        theme: 'light',
        x: { format: 'ddd, dd MMM' },
        y: { formatter: (v: number) => `${sym}${v.toFixed(2)}` },
      },
    };
  }
}
