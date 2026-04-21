export interface Product {
  readonly id: string;
  name: string;
  sku: string;
  barcode: string;
  price: number;
  cost: number;
  stock: number;
  categoryId: string;
  image: string;
  description: string;
  active: boolean;
}
