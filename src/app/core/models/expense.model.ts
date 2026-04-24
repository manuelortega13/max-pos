export interface Expense {
  readonly id: string;
  readonly date: string;              // ISO YYYY-MM-DD
  readonly category: string | null;
  readonly description: string;
  readonly amount: number;
  readonly createdAt: string;
  readonly createdById: string | null;
  readonly createdByName: string | null;
}

export interface ExpenseUpsertRequest {
  readonly date: string;              // ISO YYYY-MM-DD
  readonly category: string | null;
  readonly description: string;
  readonly amount: number;
}
