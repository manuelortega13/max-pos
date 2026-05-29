import { MovementDirection } from '../../../core/models';

/**
 * Curated category options surfaced in the manual IN/OUT dialogs.
 * Mirrors {@code MovementCategory} on the server; we keep the list
 * narrow here so admins don't free-type and create unstable buckets.
 */
export interface CategoryOption {
  readonly value: string;
  readonly label: string;
  readonly directions: readonly MovementDirection[];
}

export const MANUAL_CATEGORY_OPTIONS: readonly CategoryOption[] = [
  { value: 'OWNER_DEPOSIT', label: 'Owner deposit', directions: ['IN'] },
  { value: 'OWNER_WITHDRAWAL', label: 'Owner withdrawal', directions: ['OUT'] },
  { value: 'BANK_DEPOSIT', label: 'Bank deposit', directions: ['IN', 'OUT'] },
  { value: 'SUPPLIER_PAYMENT', label: 'Supplier payment', directions: ['OUT'] },
  { value: 'OTHER_IN', label: 'Other (income)', directions: ['IN'] },
  { value: 'OTHER_OUT', label: 'Other (expense)', directions: ['OUT'] },
];

export function categoryOptionsFor(direction: MovementDirection): CategoryOption[] {
  return MANUAL_CATEGORY_OPTIONS.filter((c) => c.directions.includes(direction));
}
