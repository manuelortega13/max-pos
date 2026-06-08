import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { SaleService } from '../../../../core/services/sale.service';
import { MoneyPipe } from '../../../../shared/pipes/currency-symbol.pipe';

interface ProductRank {
  readonly productId: string;
  readonly name: string;
  readonly quantity: number;
  readonly revenue: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * Top-selling products widget for the dashboard. Aggregates line items
 * from completed sales over a rolling window, ranked by units sold, and
 * renders the leaders with a relative-volume bar. Self-contained — reads
 * SaleService directly, no new endpoint.
 */
@Component({
  selector: 'app-top-products',
  imports: [DecimalPipe, RouterLink, MatButtonModule, MatCardModule, MatIconModule, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card appearance="outlined" class="top">
      <mat-card-header>
        <mat-card-title>Top products</mat-card-title>
        <mat-card-subtitle>Best sellers · last {{ windowDays() }} days</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (topProducts().length === 0) {
          <div class="top__empty">
            <mat-icon>inventory_2</mat-icon>
            <p>No sales in this period yet.</p>
          </div>
        } @else {
          <ol class="top__list">
            @for (p of topProducts(); track p.productId; let i = $index) {
              <li class="top__item">
                <span class="top__rank">{{ i + 1 }}</span>
                <div class="top__info">
                  <div class="top__row">
                    <strong class="top__name">{{ p.name }}</strong>
                    <span class="top__revenue">{{ p.revenue | money }}</span>
                  </div>
                  <div class="top__bar">
                    <div
                      class="top__bar-fill"
                      [style.width.%]="(p.quantity / maxQuantity()) * 100"
                    ></div>
                  </div>
                  <small class="top__qty">{{ p.quantity | number }} sold</small>
                </div>
              </li>
            }
          </ol>
        }
      </mat-card-content>
      <mat-card-actions align="end">
        <a mat-button routerLink="/admin/reports">View reports</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .top__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        padding: 1.5rem;
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
      .top__list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
      }
      .top__item {
        display: flex;
        align-items: center;
        gap: 0.85rem;
      }
      .top__rank {
        flex-shrink: 0;
        width: 1.6rem;
        height: 1.6rem;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.8rem;
        font-weight: 700;
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .top__info {
        flex: 1;
        min-width: 0;
      }
      .top__row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .top__name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .top__revenue {
        flex-shrink: 0;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .top__bar {
        margin: 0.3rem 0 0.15rem;
        height: 0.4rem;
        border-radius: 999px;
        background: var(--mat-sys-surface-container-high);
        overflow: hidden;
      }
      .top__bar-fill {
        height: 100%;
        border-radius: 999px;
        background: var(--mat-sys-primary);
      }
      .top__qty {
        color: var(--mat-sys-on-surface-variant);
        font-size: 0.75rem;
      }
    `,
  ],
})
export class TopProducts {
  private readonly saleService = inject(SaleService);

  /** Length of the rolling window, in days. */
  readonly windowDays = input<number>(30);
  /** How many leaders to show. */
  readonly limit = input<number>(5);

  /** Window's left edge (UTC midnight, inclusive), in epoch ms. */
  private readonly startMs = computed(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const base = new Date(todayIso + 'T00:00:00Z').getTime();
    return base - (this.windowDays() - 1) * MS_PER_DAY;
  });

  protected readonly topProducts = computed<ProductRank[]>(() => {
    const startMs = this.startMs();
    const agg = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const s of this.saleService.completedSales()) {
      if (Date.parse(s.date) < startMs) continue;
      for (const item of s.items) {
        const cur = agg.get(item.productId) ?? {
          name: item.productName,
          quantity: 0,
          revenue: 0,
        };
        cur.quantity += item.quantity;
        cur.revenue += item.subtotal;
        agg.set(item.productId, cur);
      }
    }
    return [...agg.entries()]
      .map(([productId, v]) => ({ productId, ...v }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, this.limit());
  });

  /** Largest quantity in the list — drives the relative bar widths. */
  protected readonly maxQuantity = computed(() =>
    Math.max(1, ...this.topProducts().map((p) => p.quantity)),
  );
}
