import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { publicOnlyGuard } from './core/guards/public-only.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [publicOnlyGuard],
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
    title: 'Sign in — MaxPOS',
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/home/home').then((m) => m.HomePage),
    title: 'MaxPOS',
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./layouts/admin-layout/admin-layout').then((m) => m.AdminLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/admin/dashboard/dashboard.page').then((m) => m.DashboardPage),
        title: 'Dashboard — MaxPOS',
      },
      {
        path: 'products',
        loadComponent: () =>
          import('./features/admin/products/products.page').then((m) => m.ProductsPage),
        title: 'Products — MaxPOS',
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./features/admin/categories/categories.page').then((m) => m.CategoriesPage),
        title: 'Categories — MaxPOS',
      },
      {
        path: 'inventory',
        loadComponent: () =>
          import('./features/admin/inventory/inventory.page').then((m) => m.InventoryPage),
        title: 'Inventory — MaxPOS',
      },
      {
        path: 'sales',
        loadComponent: () =>
          import('./features/admin/sales/sales.page').then((m) => m.SalesPage),
        title: 'Sales — MaxPOS',
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/admin/users/users.page').then((m) => m.UsersPage),
        title: 'Users — MaxPOS',
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/admin/reports/reports.page').then((m) => m.ReportsPage),
        title: 'Reports — MaxPOS',
      },
      {
        path: 'end-of-day',
        loadComponent: () =>
          import('./features/admin/end-of-day/end-of-day.page').then((m) => m.EndOfDayPage),
        title: 'End of Day — MaxPOS',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/admin/settings/settings.page').then((m) => m.SettingsPage),
        title: 'Settings — MaxPOS',
      },
    ],
  },
  {
    // Customer-facing display — fullscreen, no layout. Cashier opens
    // this in a second browser tab; it syncs to the POS cart via
    // BroadcastChannel and shows items/totals to the customer.
    path: 'display',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/customer-display/customer-display.page').then(
        (m) => m.CustomerDisplayPage,
      ),
    title: 'Customer Display — MaxPOS',
  },
  {
    path: 'cashier',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layouts/cashier-layout/cashier-layout').then((m) => m.CashierLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'pos' },
      {
        path: 'pos',
        loadComponent: () =>
          import('./features/cashier/pos/pos.page').then((m) => m.PosPage),
        title: 'Register — MaxPOS',
      },
      {
        path: 'transactions',
        loadComponent: () =>
          import('./features/cashier/transactions/transactions.page').then(
            (m) => m.TransactionsPage,
          ),
        title: 'My transactions — MaxPOS',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
