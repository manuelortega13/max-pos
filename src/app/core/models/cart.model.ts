import { DiscountInput } from './sale.model';
import { Product } from './product.model';

export interface CartLine {
  readonly product: Product;
  quantity: number;
  /**
   * Optional per-line discount. Math is done client-side for the live cart
   * preview; the backend recomputes the authoritative amount on checkout.
   */
  discount?: DiscountInput;
}
