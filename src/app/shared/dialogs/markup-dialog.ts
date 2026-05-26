import { HttpErrorResponse } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Product } from '../../core/models';
import { ProductService } from '../../core/services/product.service';
import { SettingsService } from '../../core/services/settings.service';
import { MoneyPipe } from '../pipes/currency-symbol.pipe';

/** Rounding step for the new selling price. ₱1 keeps math exact;
 *  ₱5 / ₱10 match the playbook rule that students count change in
 *  round denominations. "None" means whatever the markup math yields. */
type RoundStep = 'none' | '1' | '5' | '10';

export interface MarkupDialogData {
  readonly product: Product;
}

/**
 * Adjust a single product's selling price by typing a target markup
 * percentage. The dialog computes the new price from cost × (1 +
 * markup/100), optionally rounding up to ₱5 / ₱10 so the shelf price
 * matches the playbook's denomination rule.
 *
 * On save, calls the existing product update endpoint with the full
 * product payload (price replaced). Keeps the wire shape unchanged
 * so backend validation rules are unaffected.
 */
@Component({
  selector: 'app-markup-dialog',
  imports: [
    DecimalPipe,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="md__title">
      <mat-icon>price_change</mat-icon>
      Adjust markup
    </h2>

    <mat-dialog-content class="md__content">
      <header class="md__product">
        @if (data.product.imageUrl) {
          <img [src]="data.product.imageUrl" [alt]="data.product.name" class="md__photo" />
        } @else if (data.product.image) {
          <span class="md__emoji">{{ data.product.image }}</span>
        }
        <div class="md__product-info">
          <strong>{{ data.product.name }}</strong>
          <small>SKU: {{ data.product.sku }}</small>
        </div>
      </header>

      <section class="md__current">
        <div>
          <small>Cost</small>
          <strong>{{ data.product.cost | money }}</strong>
        </div>
        <div>
          <small>Current price</small>
          <strong>{{ data.product.price | money }}</strong>
        </div>
        <div [class.md__current-warn]="currentMarkup() < 30">
          <small>Current markup</small>
          <strong>{{ currentMarkup() | number: '1.0-0' }}%</strong>
        </div>
      </section>

      @if (data.product.cost <= 0) {
        <div class="md__warn">
          <mat-icon>warning</mat-icon>
          <span>
            This product has no cost set. Markup math requires a cost greater than zero —
            edit the product first to set its cost, then come back to adjust markup.
          </span>
        </div>
      } @else {
        <mat-form-field appearance="outline" class="md__field">
          <mat-label>Target markup</mat-label>
          <input
            matInput
            type="number"
            inputmode="decimal"
            min="0"
            step="1"
            [ngModel]="markupText()"
            (ngModelChange)="markupText.set($event)"
            autofocus
          />
          <span matTextSuffix>&nbsp;%</span>
          <mat-hint>
            Try 25–40 for soft drinks, 60–100 for snacks, 100–200 for cooked food.
          </mat-hint>
        </mat-form-field>

        <div class="md__round">
          <label>Round new price to</label>
          <mat-button-toggle-group
            [value]="roundStep()"
            (change)="roundStep.set($event.value)"
            hideSingleSelectionIndicator
          >
            <mat-button-toggle value="none">Exact</mat-button-toggle>
            <mat-button-toggle value="1">{{ currencySymbol() }}1</mat-button-toggle>
            <mat-button-toggle value="5">{{ currencySymbol() }}5</mat-button-toggle>
            <mat-button-toggle value="10">{{ currencySymbol() }}10</mat-button-toggle>
          </mat-button-toggle-group>
        </div>

        <section class="md__preview" [class.md__preview--bad]="effectiveMarkup() < 0">
          <div>
            <small>New price</small>
            <strong>{{ newPrice() | money }}</strong>
          </div>
          <div>
            <small>Effective markup</small>
            <strong>{{ effectiveMarkup() | number: '1.0-0' }}%</strong>
          </div>
          <div>
            <small>Price change</small>
            <strong>
              @if (priceChange() > 0) { + }{{ priceChange() | money }}
            </strong>
          </div>
        </section>

        @if (error(); as message) {
          <div class="md__warn" role="alert">
            <mat-icon>error_outline</mat-icon>
            <span>{{ message }}</span>
          </div>
        }
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-stroked-button mat-dialog-close [disabled]="submitting()">Cancel</button>
      <button
        mat-flat-button
        color="primary"
        [disabled]="!canSubmit()"
        (click)="submit()"
      >
        <mat-icon>{{ submitting() ? 'hourglass_empty' : 'save' }}</mat-icon>
        Save price
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .md__title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0;
      }
      .md__content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: min(28rem, 90vw);
      }
      .md__product {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.6rem 0.75rem;
        border-radius: 0.5rem;
        background: var(--mat-sys-surface-container-low);
      }
      .md__photo {
        width: 44px;
        height: 44px;
        object-fit: cover;
        border-radius: 0.4rem;
      }
      .md__emoji {
        font-size: 2rem;
        line-height: 1;
        width: 44px;
        height: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .md__product-info {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        min-width: 0;

        strong { font-size: 0.95rem; }
        small {
          color: var(--mat-sys-on-surface-variant);
          font-size: 0.75rem;
        }
      }
      .md__current, .md__preview {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.5rem;
        padding: 0.75rem 0.85rem;
        border-radius: 0.5rem;
        background: var(--mat-sys-surface-container-low);

        > div {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          min-width: 0;
        }
        small {
          font-size: 0.7rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--mat-sys-on-surface-variant);
        }
        strong {
          font-size: 1.05rem;
          font-variant-numeric: tabular-nums;
        }
      }
      .md__preview {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);

        small { color: var(--mat-sys-on-primary-container); }
      }
      .md__preview--bad {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
        small { color: var(--mat-sys-on-error-container); }
      }
      .md__current-warn strong { color: var(--mat-sys-error); }
      .md__field { width: 100%; }
      .md__round {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;

        label {
          font-size: 0.8rem;
          color: var(--mat-sys-on-surface-variant);
        }
        mat-button-toggle-group { align-self: flex-start; }
      }
      .md__warn {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        padding: 0.7rem 0.85rem;
        border-radius: 0.5rem;
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
        font-size: 0.875rem;
        line-height: 1.4;

        mat-icon { flex-shrink: 0; }
      }
    `,
  ],
})
export class MarkupDialog {
  private readonly productService = inject(ProductService);
  private readonly settingsService = inject(SettingsService);
  private readonly dialogRef = inject(MatDialogRef<MarkupDialog>);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly data = inject<MarkupDialogData>(MAT_DIALOG_DATA);

  protected readonly currencySymbol = computed(
    () => this.settingsService.settings().currencySymbol,
  );

  /** Current markup % derived from cost + price. Display-only. */
  protected readonly currentMarkup = computed(() => {
    const c = this.data.product.cost;
    if (c <= 0) return 0;
    return ((this.data.product.price - c) / c) * 100;
  });

  /** Pre-fill with the current markup rounded to whole percent so
   *  small tweaks (74 → 80) are one keystroke away rather than
   *  starting from zero. */
  protected readonly markupText = signal<string>(
    Math.max(0, Math.round(this.computeInitialMarkup())).toString(),
  );
  protected readonly roundStep = signal<RoundStep>('none');

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Parsed markup as a decimal multiplier. Returns null when the
   *  field is empty or non-numeric so the form blocks save without
   *  showing a misleading preview. */
  private readonly markup = computed<number | null>(() => {
    const raw = this.markupText().trim();
    if (raw === '') return null;
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed)) return null;
    return parsed / 100;
  });

  /** New price before rounding. */
  private readonly rawNewPrice = computed<number | null>(() => {
    const m = this.markup();
    if (m === null) return null;
    return this.data.product.cost * (1 + m);
  });

  /** New price after applying the rounding step. Always rounds UP
   *  to the nearest step — a ₱27 price rounds to ₱30 at step=5, not
   *  ₱25. Rounding down would silently lower the margin the cashier
   *  thinks they're getting. */
  protected readonly newPrice = computed<number>(() => {
    const raw = this.rawNewPrice();
    if (raw === null) return this.data.product.price;
    const step = this.roundStep();
    if (step === 'none') return Math.round(raw * 100) / 100;
    const s = Number(step);
    return Math.ceil(raw / s) * s;
  });

  /** Markup after rounding takes effect — the cashier sees this on
   *  the receipt, so display it (not the typed value). */
  protected readonly effectiveMarkup = computed<number>(() => {
    const cost = this.data.product.cost;
    if (cost <= 0) return 0;
    return ((this.newPrice() - cost) / cost) * 100;
  });

  protected readonly priceChange = computed<number>(
    () => this.newPrice() - this.data.product.price,
  );

  protected readonly canSubmit = computed<boolean>(() => {
    if (this.submitting()) return false;
    if (this.data.product.cost <= 0) return false;
    if (this.markup() === null) return false;
    if (this.newPrice() <= 0) return false;
    // Treat "no change" as not worth submitting — closes faster.
    if (Math.abs(this.priceChange()) < 0.005) return false;
    return true;
  });

  protected submit(): void {
    if (!this.canSubmit()) return;
    const p = this.data.product;
    const newPrice = Math.round(this.newPrice() * 100) / 100;
    this.submitting.set(true);
    this.error.set(null);
    this.productService
      .update(p.id, {
        name: p.name,
        sku: p.sku,
        barcodes: [...p.barcodes],
        price: newPrice,
        cost: p.cost,
        stock: p.stock,
        categoryId: p.categoryId,
        image: p.image,
        imageUrl: p.imageUrl,
        description: p.description,
        active: p.active,
      })
      .subscribe({
        next: (updated) => {
          this.snackBar.open(
            `${updated.name}: price now ${this.currencySymbol()}${newPrice.toFixed(2)}`,
            'Dismiss',
            { duration: 2500 },
          );
          this.dialogRef.close(true);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.error.set(err.error?.message ?? 'Could not update price.');
        },
      });
  }

  private computeInitialMarkup(): number {
    const c = this.data.product.cost;
    if (c <= 0) return 0;
    return ((this.data.product.price - c) / c) * 100;
  }
}
