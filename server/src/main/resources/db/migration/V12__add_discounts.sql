-- Per-line and per-sale discounts. The triple (type, value, amount) is
-- intentionally denormalized:
--   * type   — PERCENT | FIXED — what the cashier chose in the UI
--   * value  — the raw input (the percentage or the flat money amount)
--   * amount — the computed money-off applied to this row, used for all
--              arithmetic. Keeping it on the row means receipts and
--              reports are reproducible without rehydrating the rule.
-- All columns are nullable; a row with type=NULL has no discount.

ALTER TABLE sale_items
    ADD COLUMN discount_type   VARCHAR(16),
    ADD COLUMN discount_value  NUMERIC(12, 4),
    ADD COLUMN discount_amount NUMERIC(12, 2);

ALTER TABLE sales
    ADD COLUMN discount_type   VARCHAR(16),
    ADD COLUMN discount_value  NUMERIC(12, 4),
    ADD COLUMN discount_amount NUMERIC(12, 2);
