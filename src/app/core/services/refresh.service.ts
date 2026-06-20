import { Injectable, inject } from '@angular/core';
import { BusinessDayService } from './business-day.service';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { SaleService } from './sale.service';
import { SettingsService } from './settings.service';
import { UserService } from './user.service';

/**
 * Soft refresh of every top-level data service the app shell reads from.
 * Called by the pull-to-refresh gesture in the admin and cashier layouts.
 * Avoids `location.reload()` (which on a PWA means re-bootstrapping
 * Angular — slow and jarring).
 *
 * The individual services' `load()` methods are fire-and-forget; each
 * one manages its own loading signal. We wait 800 ms after kicking them
 * off to give the spinner a visible "working…" moment even on a fast
 * network.
 */
@Injectable({ providedIn: 'root' })
export class RefreshService {
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly saleService = inject(SaleService);
  private readonly userService = inject(UserService);
  private readonly settingsService = inject(SettingsService);
  private readonly businessDayService = inject(BusinessDayService);

  async refreshAll(): Promise<void> {
    this.productService.load();
    this.categoryService.load();
    this.saleService.load();
    this.userService.load();
    this.settingsService.load();
    this.businessDayService.refreshCurrent().subscribe({ error: () => {} });
    // Minimum visible spinner duration so the user gets feedback that
    // *something* happened even when the network responds instantly.
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
}
