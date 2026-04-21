import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { CategoryService } from '../../../core/services/category.service';

@Component({
  selector: 'app-categories-page',
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './categories.page.html',
  styleUrl: './categories.page.scss',
})
export class CategoriesPage {
  private readonly categoryService = inject(CategoryService);
  protected readonly categories = this.categoryService.categoriesWithCounts;
}
