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

      <p class="md__currently">
        Currently
        <strong>{{ data.product.price | money }}</strong>
        at
        <strong [class.md__current-warn]="hasCost() && currentMarkup() < 30">
          @if (hasCost()) { {{ currentMarkup() | number: '1.0-0' }}% } @else { no cost set }
        </strong>
      </p>

      <div class="md__grid">
        <mat-form-field appearance="outline" class="md__field">
          <mat-label>Cost</mat-label>
          <span matTextPrefix>{{ currencySymbol() }}&nbsp;</span>
          <input
            matInput
            type="number"
            inputmode="decimal"
            min="0"
            step="0.01"
            [ngModel]="costText()"
            (ngModelChange)="costText.set($event)"
          />
          @if (!hasCost()) {
            <mat-hint>Set the unit cost to enable markup math.</mat-hint>
          }
        </mat-form-field>

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
        </mat-form-field>
      </div>

      <p class="md__tip">
        Try 25–40 for soft drinks, 60–100 for snacks, 100–200 for cooked food.
      </p>

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

      @if (hasCost() && markup() !== null) {
        <section class="md__preview">
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
      }

      @if (disabledReason(); as reason) {
        <p class="md__hint">{{ reason }}</p>
      }

      @if (error(); as message) {
        <div class="md__warn" role="alert">
          <mat-icon>error_outline</mat-icon>
          <span>{{ message }}</span>
        </div>
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
      .md__currently {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
        font-size: 0.9rem;

        strong { color: var(--mat-sys-on-surface); }
      }
      .md__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
        gap: 0.6rem;
      }
      .md__tip {
        margin: -0.25rem 0 0;
        font-size: 0.78rem;
        color: var(--mat-sys-on-surface-variant);
      }
      .md__preview {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.5rem;
        padding: 0.75rem 0.85rem;
        border-radius: 0.5rem;
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);

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
          color: var(--mat-sys-on-primary-container);
        }
        strong {
          font-size: 1.05rem;
          font-variant-numeric: tabular-nums;
        }
      }
      .md__hint {
        margin: 0;
        padding: 0.55rem 0.75rem;
        border-radius: 0.45rem;
        background: var(--mat-sys-surface-container);
        color: var(--mat-sys-on-surface-variant);
        font-size: 0.85rem;
      }
      .md__current-warn { color: var(--mat-sys-error); }
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

  // Editable signals. Both inputs use Angular's NumberValueAccessor
  // which writes back numeric values — coerce to string defensively
  // in the parsing computeds so `.trim()` never blows up on a stray
  // number/null (this used to silently freeze the form).
  protected readonly costText = signal<string | number | null>(
    this.data.product.cost > 0 ? this.data.product.cost.toFixed(2) : '',
  );
  protected readonly markupText = signal<string | number | null>(
    Math.max(0, Math.round(this.computeInitialMarkup())).toString(),
  );
  protected readonly roundStep = signal<RoundStep>('none');

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Defensive numeric parse — accepts string, number, or null from
   *  ngModel and returns a finite number or null. Used by both
   *  costText and markupText since type="number" + ngModel can send
   *  back any of the three depending on validity/empty state. */
  private parseNum(v: string | number | null): number | null {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const trimmed = String(v).trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /** Current cost as the user has it now (live). */
  protected readonly cost = computed<number>(() => this.parseNum(this.costText()) ?? 0);

  protected readonly hasCost = computed<boolean>(() => this.cost() > 0);

  /** Display-only — markup at open time. Doesn't react to edits. */
  protected readonly currentMarkup = computed<number>(() => {
    const c = this.data.product.cost;
    if (c <= 0) return 0;
    return ((this.data.product.price - c) / c) * 100;
  });

  /** Parsed markup as a decimal multiplier. Returns null when the
   *  field is empty or non-numeric so the preview / save block
   *  cleanly. */
  protected readonly markup = computed<number | null>(() => {
    const parsed = this.parseNum(this.markupText());
    if (parsed === null) return null;
    return parsed / 100;
  });

  /** New price before rounding. Falls back to the current price if
   *  inputs are incomplete so the preview never reads `NaN`. */
  private readonly rawNewPrice = computed<number | null>(() => {
    const m = this.markup();
    const c = this.cost();
    if (m === null || c <= 0) return null;
    return c * (1 + m);
  });

  /** New price after applying the rounding step. Always rounds UP
   *  to the nearest step — a ₱27 price rounds to ₱30 at step=5, not
   *  ₱25. Rounding down would silently shrink the margin. */
  protected readonly newPrice = computed<number>(() => {
    const raw = this.rawNewPrice();
    if (raw === null) return this.data.product.price;
    const step = this.roundStep();
    if (step === 'none') return Math.round(raw * 100) / 100;
    const s = Number(step);
    return Math.ceil(raw / s) * s;
  });

  /** Markup after rounding takes effect — what the math actually
   *  yields once the price is rounded. */
  protected readonly effectiveMarkup = computed<number>(() => {
    const c = this.cost();
    if (c <= 0) return 0;
    return ((this.newPrice() - c) / c) * 100;
  });

  protected readonly priceChange = computed<number>(
    () => this.newPrice() - this.data.product.price,
  );

  /** Save guard. Intentionally lenient — only blocks on conditions
   *  that would produce a bad request. "No price change" used to
   *  block here, which trapped users whose pre-filled markup
   *  happened to match the existing price; backend update is
   *  idempotent, so we let the no-op through instead. */
  protected readonly canSubmit = computed<boolean>(() => {
    if (this.submitting()) return false;
    if (!this.hasCost()) return false;
    if (this.markup() === null) return false;
    if (this.newPrice() <= 0) return false;
    return true;
  });

  /** Surfaced as inline hint text whenever save is disabled, so the
   *  user understands *why* without having to guess. */
  protected readonly disabledReason = computed<string | null>(() => {
    if (this.submitting()) return null;
    if (!this.hasCost()) {
      return 'Enter a cost greater than zero to enable save.';
    }
    if (this.markup() === null) {
      return 'Enter a target markup percentage.';
    }
    if (this.newPrice() <= 0) {
      return 'The resulting price must be greater than zero.';
    }
    return null;
  });

  protected submit(): void {
    if (!this.canSubmit()) return;
    const p = this.data.product;
    const newPrice = Math.round(this.newPrice() * 100) / 100;
    const newCost = Math.round(this.cost() * 100) / 100;
    this.submitting.set(true);
    this.error.set(null);
    this.productService
      .update(p.id, {
        name: p.name,
        sku: p.sku,
        barcodes: [...p.barcodes],
        price: newPrice,
        cost: newCost,
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
