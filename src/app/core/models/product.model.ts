export interface Product {
  readonly id: string;
  name: string;
  sku: string;
  barcode: string | null;
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
  barcode: string | null;
  price: number;
  cost: number;
  stock: number;
  categoryId: string;
  image: string;
  imageUrl: string | null;
  description: string;
  active: boolean;
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
