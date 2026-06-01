export interface Product {
  readonly id: string;
  name: string;
  sku: string;
  /**
   * Scan codes that resolve to this product. Zero or more — most have
   * one, some have several (multi-supplier SKUs, inner-pack vs outer-
   * pack codes, etc.). All entries are valid scan targets.
   */
  barcodes: readonly string[];
  price: number;
  cost: number;
  stock: number;
  categoryId: string;
  image: string;
  imageUrl: string | null;
  description: string;
  active: boolean;
  readonly createdAt: string;
}

export interface ProductUpsertRequest {
  name: string;
  sku: string;
  barcodes: string[];
  price: number;
  cost: number;
  stock: number;
  categoryId: string;
  image: string;
  imageUrl: string | null;
  description: string;
  active: boolean;
  /**
   * Optional expiry date applied to the opening-balance batch when
   * a new product is created with `stock > 0`. ISO date
   * (`YYYY-MM-DD`). Ignored on update — stock changes after create
   * go through the Restock flow instead.
   */
  initialStockExpiry: string | null;
}

export interface ProductBatch {
  readonly id: string;
  readonly productId: string;
  readonly quantityReceived: number;
  readonly quantityRemaining: number;
  readonly expiryDate: string | null;
  readonly receivedAt: string;
  readonly costPerUnit: number | null;
  readonly note: string | null;
  readonly writtenOffAt: string | null;
}

export interface ExpiringBatch {
  readonly batchId: string;
  readonly productId: string;
  readonly productName: string;
  readonly productImage: string;
  readonly productImageUrl: string | null;
  readonly quantityRemaining: number;
  readonly expiryDate: string;
  readonly daysUntilExpiry: number;
}
