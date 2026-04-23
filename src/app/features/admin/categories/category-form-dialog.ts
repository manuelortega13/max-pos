import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Category, CategoryUpsertRequest } from '../../../core/models';
import { CategoryService } from '../../../core/services/category.service';

export type CategoryFormMode = 'create' | 'edit';

export interface CategoryFormData {
  readonly mode: CategoryFormMode;
  readonly category?: Category;
}

/** Curated palette that matches the existing seed data's look. Admin can
 *  still type any hex value in the picker — this is just quick-select. */
const PRESET_COLORS = [
  '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981',
  '#84cc16', '#eab308', '#f59e0b', '#f97316', '#ef4444',
  '#ec4899', '#a855f7', '#8b5cf6', '#6366f1', '#64748b',
] as const;

/** Popular Material Symbols icons relevant to retail categories. */
const PRESET_ICONS = [
  'local_drink', 'cookie', 'bakery_dining', 'egg', 'eco',
  'cleaning_services', 'icecream', 'coffee', 'restaurant', 'local_pizza',
  'local_florist', 'pets', 'child_care', 'checkroom', 'spa',
  'health_and_safety', 'construction', 'sports_esports', 'home', 'category',
] as const;

@Component({
  selector: 'app-category-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './category-form-dialog.html',
  styleUrl: './category-form-dialog.scss',
})
export class CategoryFormDialog {
  private readonly fb = inject(FormBuilder);
  private readonly categoryService = inject(CategoryService);
  private readonly dialogRef = inject(MatDialogRef<CategoryFormDialog>);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly data = inject<CategoryFormData>(MAT_DIALOG_DATA);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly presetColors = PRESET_COLORS;
  protected readonly presetIcons = PRESET_ICONS;

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: ['', [Validators.maxLength(1024)]],
    color: ['#3b82f6', [Validators.required, Validators.pattern(/^#[0-9a-fA-F]{6}$/)]],
    icon: ['category', [Validators.required, Validators.maxLength(64)]],
  });

  // Live reads for the preview card
  protected readonly previewName = signal<string>('New category');
  protected readonly previewColor = signal<string>('#3b82f6');
  protected readonly previewIcon = signal<string>('category');

  protected readonly isColorChosen = computed(() => (color: string) =>
    this.previewColor() === color,
  );

  constructor() {
    const c = this.data.category;
    if (c) {
      this.form.patchValue({
        name: c.name,
        description: c.description ?? '',
        color: c.color,
        icon: c.icon,
      });
      this.previewName.set(c.name);
      this.previewColor.set(c.color);
      this.previewIcon.set(c.icon);
    }

    this.form.controls.name.valueChanges.subscribe((v) =>
      this.previewName.set(v || 'New category'),
    );
    this.form.controls.color.valueChanges.subscribe((v) => this.previewColor.set(v));
    this.form.controls.icon.valueChanges.subscribe((v) => this.previewIcon.set(v));
  }

  protected get title(): string {
    return this.data.mode === 'edit' ? 'Edit category' : 'New category';
  }

  protected get submitLabel(): string {
    return this.data.mode === 'edit' ? 'Save changes' : 'Create category';
  }

  protected pickColor(color: string): void {
    this.form.controls.color.setValue(color);
  }

  protected pickIcon(icon: string): void {
    this.form.controls.icon.setValue(icon);
  }

  protected submit(): void {
    if (this.submitting()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);

    const request: CategoryUpsertRequest = this.form.getRawValue();
    const obs =
      this.data.mode === 'edit' && this.data.category
        ? this.categoryService.update(this.data.category.id, request)
        : this.categoryService.create(request);

    obs.subscribe({
      next: (category) => {
        const verb = this.data.mode === 'edit' ? 'Updated' : 'Created';
        this.snackBar.open(`${verb} "${category.name}"`, 'Dismiss', { duration: 2500 });
        this.dialogRef.close(true);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(this.describe(err));
      },
    });
  }

  private describe(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Cannot reach the server.';
    if (err.status === 409) return err.error?.message ?? 'A category with that name already exists.';
    if (err.status === 403) return 'Only admins can manage categories.';
    if (err.status === 400) return err.error?.message ?? 'Validation failed.';
    const apiMessage =
      err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message?: unknown }).message)
        : null;
    return apiMessage ?? 'Something went wrong.';
  }
}
