-- Seed data for a fresh MaxPOS install.
-- Default admin login:
--   email:    admin@maxpos.com
--   password: admin123   (CHANGE THIS IMMEDIATELY in production)
-- The password_hash below is a BCrypt hash of "admin123".

INSERT INTO users (id, name, email, password_hash, role, active) VALUES
    (gen_random_uuid(), 'System Admin',   'admin@maxpos.com',            '$2a$10$GLYRjVaBV0KymiaMkHrkT.ayDBSwRJp9rFLSLBXsu8NqnP2DsNhAe', 'ADMIN',   TRUE),
    (gen_random_uuid(), 'Sarah Chen',     'sarah.chen@maxpos.com',       '$2a$10$GLYRjVaBV0KymiaMkHrkT.ayDBSwRJp9rFLSLBXsu8NqnP2DsNhAe', 'CASHIER', TRUE),
    (gen_random_uuid(), 'Carlos Rivera',  'carlos.rivera@maxpos.com',    '$2a$10$GLYRjVaBV0KymiaMkHrkT.ayDBSwRJp9rFLSLBXsu8NqnP2DsNhAe', 'CASHIER', TRUE);

INSERT INTO store_settings (id, store_name, currency, currency_symbol, tax_rate, receipt_footer, address, phone) VALUES
    (1, 'MaxPOS Demo Store', 'USD', '$', 0.1200, 'Thank you for shopping with us!', '123 Main Street, Springfield', '+1 (555) 010-2026');

-- Categories
WITH cats(name, description, color, icon) AS (
    VALUES
        ('Beverages', 'Drinks and refreshments',       '#3b82f6', 'local_drink'),
        ('Snacks',    'Chips, candy, and quick bites', '#f59e0b', 'cookie'),
        ('Bakery',    'Bread, pastries, and baked goods', '#f97316', 'bakery_dining'),
        ('Dairy',     'Milk, cheese, yogurt',          '#06b6d4', 'egg'),
        ('Produce',   'Fresh fruits and vegetables',   '#10b981', 'eco'),
        ('Household', 'Cleaning and home goods',       '#8b5cf6', 'cleaning_services')
)
INSERT INTO categories (name, description, color, icon)
SELECT name, description, color, icon FROM cats;

-- Products (category_id resolved by name)
INSERT INTO products (name, sku, barcode, price, cost, stock, category_id, image, description, active)
SELECT p.name, p.sku, p.barcode, p.price, p.cost, p.stock, c.id, p.image, p.description, p.active
FROM (VALUES
    ('Coca-Cola 500ml',  'BEV-001', '7501055363001', 1.50, 0.80, 120, 'Beverages', '🥤', 'Classic Coca-Cola bottle',   TRUE),
    ('Bottled Water 1L', 'BEV-002', '7501055363002', 1.00, 0.30, 200, 'Beverages', '💧', 'Purified water',              TRUE),
    ('Orange Juice',     'BEV-003', '7501055363003', 3.50, 1.80,  45, 'Beverages', '🧃', '100% fresh orange juice',     TRUE),
    ('Coffee',           'BEV-004', '7501055363004', 2.50, 0.70,  80, 'Beverages', '☕', 'Hot brewed coffee',           TRUE),
    ('Potato Chips',     'SNK-001', '7501055363005', 2.00, 0.90,  90, 'Snacks',    '🍟', 'Salted potato chips',         TRUE),
    ('Chocolate Bar',    'SNK-002', '7501055363006', 1.80, 0.60, 150, 'Snacks',    '🍫', 'Milk chocolate bar',          TRUE),
    ('Cookies Pack',     'SNK-003', '7501055363007', 2.50, 1.00,  60, 'Snacks',    '🍪', 'Chocolate chip cookies',      TRUE),
    ('Peanuts',          'SNK-004', '7501055363008', 1.20, 0.40,   8, 'Snacks',    '🥜', 'Roasted salted peanuts',      TRUE),
    ('Croissant',        'BAK-001', '7501055363009', 2.00, 0.80,  30, 'Bakery',    '🥐', 'Butter croissant',            TRUE),
    ('Baguette',         'BAK-002', '7501055363010', 3.00, 1.20,  25, 'Bakery',    '🥖', 'French baguette',             TRUE),
    ('Donut',            'BAK-003', '7501055363011', 1.50, 0.50,  40, 'Bakery',    '🍩', 'Glazed donut',                TRUE),
    ('Milk 1L',          'DRY-001', '7501055363012', 2.20, 1.00,  70, 'Dairy',     '🥛', 'Whole milk',                  TRUE),
    ('Cheddar Cheese',   'DRY-002', '7501055363013', 5.50, 2.80,  20, 'Dairy',     '🧀', 'Aged cheddar block',          TRUE),
    ('Greek Yogurt',     'DRY-003', '7501055363014', 3.00, 1.40,  55, 'Dairy',     '🥣', 'Plain Greek yogurt',          TRUE),
    ('Banana (kg)',      'PRD-001', '7501055363015', 1.80, 0.70, 100, 'Produce',   '🍌', 'Fresh bananas',               TRUE),
    ('Apple (kg)',       'PRD-002', '7501055363016', 2.50, 1.10,  85, 'Produce',   '🍎', 'Red apples',                  TRUE),
    ('Tomato (kg)',      'PRD-003', '7501055363017', 2.00, 0.90,   5, 'Produce',   '🍅', 'Fresh tomatoes',              TRUE),
    ('Dish Soap',        'HHD-001', '7501055363018', 3.50, 1.50,  50, 'Household', '🧼', 'Lemon dish soap',             TRUE),
    ('Paper Towels',     'HHD-002', '7501055363019', 4.00, 1.80,  40, 'Household', '🧻', '6-pack paper towels',         TRUE),
    ('Trash Bags',       'HHD-003', '7501055363020', 5.00, 2.20,   0, 'Household', '🗑', '30-count trash bags',         FALSE)
) AS p(name, sku, barcode, price, cost, stock, category_name, image, description, active)
JOIN categories c ON c.name = p.category_name;
