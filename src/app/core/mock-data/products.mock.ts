import { Product } from '../models';

export const PRODUCTS_MOCK: Product[] = [
  { id: 'p1', name: 'Coca-Cola 500ml', sku: 'BEV-001', barcode: '7501055363001', price: 1.5, cost: 0.8, stock: 120, categoryId: 'c1', image: '🥤', description: 'Classic Coca-Cola bottle', active: true },
  { id: 'p2', name: 'Bottled Water 1L', sku: 'BEV-002', barcode: '7501055363002', price: 1.0, cost: 0.3, stock: 200, categoryId: 'c1', image: '💧', description: 'Purified water', active: true },
  { id: 'p3', name: 'Orange Juice', sku: 'BEV-003', barcode: '7501055363003', price: 3.5, cost: 1.8, stock: 45, categoryId: 'c1', image: '🧃', description: '100% fresh orange juice', active: true },
  { id: 'p4', name: 'Coffee', sku: 'BEV-004', barcode: '7501055363004', price: 2.5, cost: 0.7, stock: 80, categoryId: 'c1', image: '☕', description: 'Hot brewed coffee', active: true },
  { id: 'p5', name: 'Potato Chips', sku: 'SNK-001', barcode: '7501055363005', price: 2.0, cost: 0.9, stock: 90, categoryId: 'c2', image: '🍟', description: 'Salted potato chips', active: true },
  { id: 'p6', name: 'Chocolate Bar', sku: 'SNK-002', barcode: '7501055363006', price: 1.8, cost: 0.6, stock: 150, categoryId: 'c2', image: '🍫', description: 'Milk chocolate bar', active: true },
  { id: 'p7', name: 'Cookies Pack', sku: 'SNK-003', barcode: '7501055363007', price: 2.5, cost: 1.0, stock: 60, categoryId: 'c2', image: '🍪', description: 'Chocolate chip cookies', active: true },
  { id: 'p8', name: 'Peanuts', sku: 'SNK-004', barcode: '7501055363008', price: 1.2, cost: 0.4, stock: 8, categoryId: 'c2', image: '🥜', description: 'Roasted salted peanuts', active: true },
  { id: 'p9', name: 'Croissant', sku: 'BAK-001', barcode: '7501055363009', price: 2.0, cost: 0.8, stock: 30, categoryId: 'c3', image: '🥐', description: 'Butter croissant', active: true },
  { id: 'p10', name: 'Baguette', sku: 'BAK-002', barcode: '7501055363010', price: 3.0, cost: 1.2, stock: 25, categoryId: 'c3', image: '🥖', description: 'French baguette', active: true },
  { id: 'p11', name: 'Donut', sku: 'BAK-003', barcode: '7501055363011', price: 1.5, cost: 0.5, stock: 40, categoryId: 'c3', image: '🍩', description: 'Glazed donut', active: true },
  { id: 'p12', name: 'Milk 1L', sku: 'DRY-001', barcode: '7501055363012', price: 2.2, cost: 1.0, stock: 70, categoryId: 'c4', image: '🥛', description: 'Whole milk', active: true },
  { id: 'p13', name: 'Cheddar Cheese', sku: 'DRY-002', barcode: '7501055363013', price: 5.5, cost: 2.8, stock: 20, categoryId: 'c4', image: '🧀', description: 'Aged cheddar block', active: true },
  { id: 'p14', name: 'Greek Yogurt', sku: 'DRY-003', barcode: '7501055363014', price: 3.0, cost: 1.4, stock: 55, categoryId: 'c4', image: '🥣', description: 'Plain Greek yogurt', active: true },
  { id: 'p15', name: 'Banana (kg)', sku: 'PRD-001', barcode: '7501055363015', price: 1.8, cost: 0.7, stock: 100, categoryId: 'c5', image: '🍌', description: 'Fresh bananas', active: true },
  { id: 'p16', name: 'Apple (kg)', sku: 'PRD-002', barcode: '7501055363016', price: 2.5, cost: 1.1, stock: 85, categoryId: 'c5', image: '🍎', description: 'Red apples', active: true },
  { id: 'p17', name: 'Tomato (kg)', sku: 'PRD-003', barcode: '7501055363017', price: 2.0, cost: 0.9, stock: 5, categoryId: 'c5', image: '🍅', description: 'Fresh tomatoes', active: true },
  { id: 'p18', name: 'Dish Soap', sku: 'HHD-001', barcode: '7501055363018', price: 3.5, cost: 1.5, stock: 50, categoryId: 'c6', image: '🧼', description: 'Lemon dish soap', active: true },
  { id: 'p19', name: 'Paper Towels', sku: 'HHD-002', barcode: '7501055363019', price: 4.0, cost: 1.8, stock: 40, categoryId: 'c6', image: '🧻', description: '6-pack paper towels', active: true },
  { id: 'p20', name: 'Trash Bags', sku: 'HHD-003', barcode: '7501055363020', price: 5.0, cost: 2.2, stock: 0, categoryId: 'c6', image: '🗑', description: '30-count trash bags', active: false },
];
