import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { planGuard } from './core/guards/plan.guard';
import { publicOnlyGuard } from './core/guards/public-only.guard';
import { platformGuard, platformPublicOnlyGuard } from './core/guards/platform.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [publicOnlyGuard],
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
    title: 'Sign in — MaxPOS',
  },
  {
    path: 'register',
    loadComponent: () => import('./features/register/register.page').then((m) => m.RegisterPage),
    title: 'Create your store — MaxPOS',
  },
  {
    path: 'subscribe',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/subscription/choose-plan.page').then((m) => m.ChoosePlanPage),
    title: 'Choose your plan — MaxPOS',
  },
  {
    path: 'platform/login',
    canActivate: [platformPublicOnlyGuard],
    loadComponent: () =>
      import('./features/platform/platform-login.page').then((m) => m.PlatformLoginPage),
    title: 'Platform console — MaxPOS',
  },
  {
    path: 'platform',
    canActivate: [platformGuard],
    loadComponent: () =>
      import('./layouts/platform-layout/platform-layout').then((m) => m.PlatformLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      {
        path: 'overview',
        loadComponent: () =>
          import('./features/platform/platform-overview.page').then((m) => m.PlatformOverviewPage),
        title: 'Overview — Platform console',
      },
      {
        path: 'stores',
        loadComponent: () =>
          import('./features/platform/platform-stores.page').then((m) => m.PlatformStoresPage),
        title: 'Stores — Platform console',
      },
      {
        path: 'stores/:id',
        loadComponent: () =>
          import('./features/platform/platform-store-detail.page').then(
            (m) => m.PlatformStoreDetailPage,
          ),
        title: 'Store — Platform console',
      },
      {
        path: 'plans',
        loadComponent: () =>
          import('./features/platform/platform-plans.page').then((m) => m.PlatformPlansPage),
        title: 'Plans — Platform console',
      },
      {
        path: 'activity',
        loadComponent: () =>
          import('./features/platform/platform-activity.page').then((m) => m.PlatformActivityPage),
        title: 'Activity — Platform console',
      },
      {
        path: 'admins',
        loadComponent: () =>
          import('./features/platform/platform-admins.page').then((m) => m.PlatformAdminsPage),
        title: 'Platform admins — Platform console',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/platform/platform-settings.page').then((m) => m.PlatformSettingsPage),
        title: 'Settings — Platform console',
      },
    ],
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/home/home').then((m) => m.HomePage),
    title: 'MaxPOS',
  },
  {
    path: 'admin',
    canActivate: [adminGuard, planGuard],
    loadComponent: () => import('./layouts/admin-layout/admin-layout').then((m) => m.AdminLayout),
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
        loadComponent: () => import('./features/admin/sales/sales.page').then((m) => m.SalesPage),
        title: 'Sales — MaxPOS',
      },
      {
        path: 'users',
        loadComponent: () => import('./features/admin/users/users.page').then((m) => m.UsersPage),
        title: 'Users — MaxPOS',
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/admin/reports/reports.page').then((m) => m.ReportsPage),
        title: 'Reports — MaxPOS',
      },
      {
        path: 'creditors',
        loadComponent: () =>
          import('./features/admin/creditors/creditors.page').then((m) => m.CreditorsPage),
        title: 'Creditors — MaxPOS',
      },
      {
        path: 'creditors/:id',
        loadComponent: () =>
          import('./features/admin/creditors/creditor-detail.page').then(
            (m) => m.CreditorDetailPage,
          ),
        title: 'Creditor — MaxPOS',
      },
      {
        path: 'end-of-day',
        loadComponent: () =>
          import('./features/admin/end-of-day/end-of-day.page').then((m) => m.EndOfDayPage),
        title: 'End of Day — MaxPOS',
      },
      {
        path: 'gcash',
        loadComponent: () => import('./features/admin/gcash/gcash.page').then((m) => m.GcashPage),
        title: 'GCash — MaxPOS',
      },
      {
        path: 'load',
        loadComponent: () => import('./features/admin/load/load.page').then((m) => m.AdminLoadPage),
        title: 'Load — MaxPOS',
      },
      {
        path: 'finances',
        loadComponent: () =>
          import('./features/admin/finances/finances.page').then((m) => m.FinancesPage),
        title: 'Finances — MaxPOS',
      },
      {
        path: 'finances/:id',
        loadComponent: () =>
          import('./features/admin/finances/account-detail.page').then(
            (m) => m.FinancesAccountDetailPage,
          ),
        title: 'Account — MaxPOS',
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
        loadComponent: () => import('./features/cashier/pos/pos.page').then((m) => m.PosPage),
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
      {
        path: 'credit-payment',
        loadComponent: () =>
          import('./features/cashier/credit-payment/credit-payment.page').then(
            (m) => m.CreditPaymentPage,
          ),
        title: 'Credit payment — MaxPOS',
      },
      {
        path: 'gcash',
        loadComponent: () => import('./features/cashier/gcash/gcash.page').then((m) => m.GcashPage),
        title: 'GCash — MaxPOS',
      },
      {
        path: 'load',
        loadComponent: () => import('./features/cashier/load/load.page').then((m) => m.LoadPage),
        title: 'Load — MaxPOS',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
