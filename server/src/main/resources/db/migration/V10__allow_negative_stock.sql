-- Admin-togglable: let cashiers oversell a product past its available stock.
-- When enabled, SaleService skips the pre-sale stock check and
-- ProductService.deductStockFefo drives the last touched batch's
-- quantity_remaining negative.
ALTER TABLE store_settings
    ADD COLUMN allow_negative_stock BOOLEAN NOT NULL DEFAULT FALSE;

-- product_batches.quantity_remaining was locked at >= 0. With the new
-- oversell behavior we need to let it go negative. The
-- chk_remaining_le_received CHECK still holds for negatives
-- (e.g. -5 <= 10), so leave it in place.
ALTER TABLE product_batches
    DROP CONSTRAINT IF EXISTS product_batches_quantity_remaining_check;
