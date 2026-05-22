-- One-off cleanup: delete all sales dated before 2026-05-22.
-- sale_items rows are removed automatically via ON DELETE CASCADE on sale_items.sale_id.
DELETE FROM sales WHERE date < DATE '2026-05-22';
