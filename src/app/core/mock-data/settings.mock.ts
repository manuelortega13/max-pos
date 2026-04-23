import { StoreSettings } from '../models';

export const SETTINGS_MOCK: StoreSettings = {
  storeName: 'MaxPOS Demo Store',
  currency: 'USD',
  currencySymbol: '$',
  taxRate: 0.12,
  receiptFooter: 'Thank you for shopping with us!',
  address: '123 Main Street, Springfield',
  phone: '+1 (555) 010-2026',
  allowNegativeStock: false,
};
