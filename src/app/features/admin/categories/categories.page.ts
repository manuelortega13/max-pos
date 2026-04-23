import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Category } from '../../../core/models';
import { CategoryService } from '../../../core/services/category.service';
import { ConfirmDialog } from '../../../shared/dialogs/confirm-dialog';
import { CategoryFormDialog } from './category-form-dialog';

@Component({
  selector: 'app-categories-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './categories.page.html',
  styleUrl: './categories.page.scss',
})
export class CategoriesPage {
  private readonly categoryService = inject(CategoryService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly categories = this.categoryService.categoriesWithCounts;
  protected readonly loading = this.categoryService.loading;
  protected readonly error = this.categoryService.error;

  protected retry(): void {
    this.categoryService.load();
  }

  protected openCreate(): void {
    this.dialog.open(CategoryFormDialog, {
      width: '560px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      panelClass: 'dialog-fullscreen-mobile',
      data: { mode: 'create' },
    });
  }

  protected openEdit(category: Category): void {
    this.dialog.open(CategoryFormDialog, {
      width: '560px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      panelClass: 'dialog-fullscreen-mobile',
      data: { mode: 'edit', category },
    });
  }

  protected confirmDelete(category: Category & { productCount: number }): void {
    if (category.productCount > 0) {
      this.snackBar.open(
        `Cannot delete "${category.name}" — ${category.productCount} product(s) still use it. Reassign them first.`,
        'Dismiss',
        { duration: 4500 },
      );
      return;
    }
    const ref = this.dialog.open(ConfirmDialog, {
      width: '440px',
      data: {
        title: 'Delete category',
        message: `Delete "${category.name}"? This can't be undone.`,
        confirmLabel: 'Delete',
        destructive: true,
        icon: 'delete_forever',
      },
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.categoryService.delete(category.id).subscribe({
        next: () => this.snackBar.open(`Deleted "${category.name}"`, 'Dismiss', { duration: 2500 }),
        error: (err: HttpErrorResponse) => {
          const msg =
            err.error?.message ??
            (err.status === 409
              ? 'Cannot delete — category is still referenced by products.'
              : 'Delete failed.');
          this.snackBar.open(msg, 'Dismiss', { duration: 4000 });
        },
      });
    });
  }
}
