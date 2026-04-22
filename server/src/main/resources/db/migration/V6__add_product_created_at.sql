-- Track when each product was added so the admin list can show newest-first.
-- DEFAULT now() backfills existing rows at migration time — seed products will
-- all share roughly the same timestamp, so the admin list falls back to name
-- ordering as a tiebreaker (handled in ProductService).

ALTER TABLE products
    ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX idx_products_created_at ON products (created_at DESC);
