-- Switch stock tracking from a single counter on `products` to a set of
-- batches per product, enabling per-shipment expiry dates and FEFO depletion.
--
-- After this migration:
--   - products.stock column no longer exists
--   - products.stock at the API/JPA layer is computed as SUM of non-expired,
--     non-written-off batches (handled via @Formula on the Product entity)
--   - restock() inserts a batch instead of incrementing a counter
--   - sale create deducts from batches ordered by expiry_date ASC NULLS LAST

CREATE TABLE product_batches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id          UUID           NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity_received   INTEGER        NOT NULL CHECK (quantity_received > 0),
    quantity_remaining  INTEGER        NOT NULL CHECK (quantity_remaining >= 0),
    expiry_date         DATE,
    received_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
    cost_per_unit       NUMERIC(12, 2),
    note                TEXT,
    written_off_at      TIMESTAMPTZ,
    CONSTRAINT chk_remaining_le_received CHECK (quantity_remaining <= quantity_received)
);

CREATE INDEX idx_batches_product ON product_batches (product_id);

-- Supports FEFO lookup: per-product, ordered by expiry (nulls last), then received_at
CREATE INDEX idx_batches_fefo
    ON product_batches (product_id, expiry_date NULLS LAST, received_at)
    WHERE written_off_at IS NULL AND quantity_remaining > 0;

-- Seed an "opening balance" batch for every product that currently has stock.
-- expiry_date = NULL because the original schema didn't track it; admins can
-- write these off or let them persist indefinitely.
INSERT INTO product_batches (
    product_id, quantity_received, quantity_remaining, expiry_date, received_at, note
)
SELECT id, stock, stock, NULL, created_at, 'Opening balance'
  FROM products
 WHERE stock > 0;

-- products.stock is now a derived value; drop the column to prevent drift.
ALTER TABLE products DROP COLUMN stock;
