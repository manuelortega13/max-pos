-- Not every product needs a barcode (bulk items, internal-use products, etc.).
-- Keep the UNIQUE constraint — Postgres treats multiple NULLs as distinct, so
-- several products without a barcode coexist fine, while any barcode that IS
-- set still has to be unique.

ALTER TABLE products ALTER COLUMN barcode DROP NOT NULL;
