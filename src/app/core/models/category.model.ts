export interface Category {
  readonly id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
}

export interface CategoryUpsertRequest {
  name: string;
  description: string;
  color: string;
  icon: string;
}
