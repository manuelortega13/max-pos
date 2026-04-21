import { Product } from './product.model';

export interface CartLine {
  readonly product: Product;
  quantity: number;
}
