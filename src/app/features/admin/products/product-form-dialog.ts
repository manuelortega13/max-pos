import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Product, ProductUpsertRequest } from '../../../core/models';
import { BarcodeScannerService } from '../../../core/services/barcode-scanner.service';
import { CategoryService } from '../../../core/services/category.service';
import { ProductService } from '../../../core/services/product.service';
import { SettingsService } from '../../../core/services/settings.service';
import { fileToResizedDataUrl } from '../../../shared/utils/image';

export type ProductFormMode = 'create' | 'edit' | 'duplicate';

export interface ProductFormData {
  readonly mode: ProductFormMode;
  readonly product?: Product;
}

const SKU_PATTERN = /^([A-Z]+)-?(\d+)$/;

@Component({
  selector: 'app-product-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-form-dialog.html',
  styleUrl: './product-form-dialog.scss',
})
export class ProductFormDialog {
  private readonly fb = inject(FormBuilder);
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly settingsService = inject(SettingsService);
  private readonly dialogRef = inject(MatDialogRef<ProductFormDialog>);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly scanner = inject(BarcodeScannerService);
  protected readonly data = inject<ProductFormData>(MAT_DIALOG_DATA);

  protected readonly cameraSupported = this.scanner.isSupported;

  protected readonly categories = this.categoryService.categories;
  protected readonly currencySymbol = computed(
    () => this.settingsService.settings().currencySymbol,
  );
  protected readonly submitting = signal(false);
  protected readonly processingImage = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly imageUrl = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    sku: ['', [Validators.required, Validators.maxLength(64)]],
    barcode: ['', [Validators.maxLength(64)]],
    cost: [0, [Validators.required, Validators.min(0)]],
    markup: [0, [Validators.min(-100)]],
    price: [0, [Validators.required, Validators.min(0)]],
    stock: [0, [Validators.required, Validators.min(0)]],
    categoryId: ['', [Validators.required]],
    image: ['', [Validators.maxLength(16)]],
    description: ['', [Validators.maxLength(2048)]],
    active: [true],
  });

  /** Flips true the moment the user types into the SKU field, so we stop
   *  auto-suggesting and let them own it. */
  private skuUserEdited = false;
  /** Loop guard for cost/markup/price bidirectional sync. */
  private syncing = false;

  constructor() {
    this.hydrateFromData();
    this.wireCategoryToSkuSuggestion();
    this.wirePriceMarkupCostSync();
  }

  protected get title(): string {
    switch (this.data.mode) {
      case 'create':
        return 'New product';
      case 'edit':
        return 'Edit product';
      case 'duplicate':
        return 'Duplicate product';
    }
  }

  protected get submitLabel(): string {
    return this.data.mode === 'edit' ? 'Save changes' : 'Create product';
  }

  protected onSkuUserInput(): void {
    this.skuUserEdited = true;
  }

  protected async onImagePicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.processingImage.set(true);
    this.error.set(null);
    try {
      const dataUrl = await fileToResizedDataUrl(file, { maxEdge: 400, quality: 0.82 });
      this.imageUrl.set(dataUrl);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not read image');
    } finally {
      this.processingImage.set(false);
    }
  }

  protected clearImage(): void {
    this.imageUrl.set(null);
  }

  /**
   * Open the camera scanner and, on a successful read, write the decoded
   * string into the Barcode form control. No product lookup here — the
   * admin is defining what this product's barcode is.
   */
  protected async scanBarcode(): Promise<void> {
    const code = await this.scanner.scan();
    if (!code) return;
    this.form.controls.barcode.setValue(code);
    this.form.controls.barcode.markAsDirty();
    this.snackBar.open(`Scanned ${code}`, 'Dismiss', { duration: 1500 });
  }

  protected submit(): void {
    if (this.submitting()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);

    const raw = this.form.getRawValue();
    const request: ProductUpsertRequest = {
      name: raw.name,
      sku: raw.sku,
      barcode: raw.barcode.trim() === '' ? null : raw.barcode.trim(),
      price: raw.price,
      cost: raw.cost,
      stock: raw.stock,
      categoryId: raw.categoryId,
      image: raw.image,
      imageUrl: this.imageUrl(),
      description: raw.description,
      active: raw.active,
    };
    const obs =
      this.data.mode === 'edit' && this.data.product
        ? this.productService.update(this.data.product.id, request)
        : this.productService.create(request);

    obs.subscribe({
      next: (product) => {
        const verb = this.data.mode === 'edit' ? 'Updated' : 'Created';
        this.snackBar.open(`${verb} "${product.name}"`, 'Dismiss', { duration: 2500 });
        this.dialogRef.close(true);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(this.describe(err));
      },
    });
  }

  private hydrateFromData(): void {
    const p = this.data.product;
    if (!p) return;

    this.form.patchValue({
      name: this.data.mode === 'duplicate' ? `${p.name} (copy)` : p.name,
      sku: this.data.mode === 'duplicate' ? '' : p.sku,
      barcode: this.data.mode === 'duplicate' ? '' : (p.barcode ?? ''),
      price: p.price,
      cost: p.cost,
      stock: this.data.mode === 'duplicate' ? 0 : p.stock,
      categoryId: p.categoryId,
      image: p.image ?? '',
      description: p.description ?? '',
      active: p.active,
    });
    // Derive markup from existing cost/price.
    this.form.controls.markup.setValue(this.deriveMarkup(p.cost, p.price), {
      emitEvent: false,
    });
    this.imageUrl.set(p.imageUrl ?? null);

    // On edit the existing SKU is authoritative — don't auto-suggest over it.
    if (this.data.mode !== 'create') {
      this.skuUserEdited = true;
    }
  }

  private wireCategoryToSkuSuggestion(): void {
    this.form.controls.categoryId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((categoryId) => {
        if (this.skuUserEdited) return;
        const suggestion = this.suggestSku(categoryId);
        if (suggestion) {
          this.form.controls.sku.setValue(suggestion, { emitEvent: false });
        }
      });
  }

  private wirePriceMarkupCostSync(): void {
    this.form.controls.cost.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((cost) => {
        if (this.syncing) return;
        this.syncing = true;
        const markup = this.form.controls.markup.value;
        this.form.controls.price.setValue(this.computePrice(cost, markup), {
          emitEvent: false,
        });
        this.syncing = false;
      });

    this.form.controls.markup.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((markup) => {
        if (this.syncing) return;
        this.syncing = true;
        const cost = this.form.controls.cost.value;
        this.form.controls.price.setValue(this.computePrice(cost, markup), {
          emitEvent: false,
        });
        this.syncing = false;
      });

    this.form.controls.price.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((price) => {
        if (this.syncing) return;
        this.syncing = true;
        const cost = this.form.controls.cost.value;
        this.form.controls.markup.setValue(this.deriveMarkup(cost, price), {
          emitEvent: false,
        });
        this.syncing = false;
      });
  }

  private suggestSku(categoryId: string): string | null {
    if (!categoryId) return null;
    const category = this.categoryService.getById(categoryId);
    if (!category) return null;

    const fallbackPrefix = category.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'PRD';
    const categorySkus = this.productService
      .products()
      .filter((p) => p.categoryId === categoryId)
      .map((p) => p.sku);

    let prefix = fallbackPrefix;
    let maxSeq = 0;
    for (const sku of categorySkus) {
      const match = sku.match(SKU_PATTERN);
      if (!match) continue;
      prefix = match[1];
      const seq = parseInt(match[2], 10);
      if (seq > maxSeq) maxSeq = seq;
    }

    return `${prefix}-${String(maxSeq + 1).padStart(3, '0')}`;
  }

  private computePrice(cost: number, markupPercent: number): number {
    const c = Number(cost) || 0;
    const m = Number(markupPercent) || 0;
    return Math.round(c * (1 + m / 100) * 100) / 100;
  }

  private deriveMarkup(cost: number, price: number): number {
    const c = Number(cost) || 0;
    const p = Number(price) || 0;
    if (c <= 0) return 0;
    return Math.round(((p / c) - 1) * 1000) / 10;
  }

  private describe(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Cannot reach the server.';
    if (err.status === 409) return err.error?.message ?? 'Duplicate SKU or barcode.';
    if (err.status === 400) return err.error?.message ?? 'Validation failed.';
    const apiMessage =
      err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message?: unknown }).message)
        : null;
    return apiMessage ?? 'Something went wrong.';
  }
}
