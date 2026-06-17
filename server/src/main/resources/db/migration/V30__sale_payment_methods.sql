-- Add GCASH, MAYA, and BANK as cashier sale payment methods.
--
-- Widen the sales.payment_method CHECK (see V18). The creditor-symmetry
-- constraint (sales_credit_creditor_consistent) is unchanged and still
-- requires creditor_id IS NULL for every non-CREDIT method, which correctly
-- covers the three new immediate-payment methods.
ALTER TABLE sales DROP CONSTRAINT sales_payment_method_check;
ALTER TABLE sales ADD CONSTRAINT sales_payment_method_check
    CHECK (payment_method IN ('CASH', 'CARD', 'TRANSFER', 'GCASH', 'MAYA', 'BANK', 'CREDIT'));

-- Z-report buckets so the end-of-day breakdown accounts for the new methods
-- separately (like card/transfer). They don't touch the cash drawer, so the
-- cash-reconciliation math is unaffected. Nullable to match the other
-- per-method snapshot columns; populated by BusinessDayService.close().
ALTER TABLE business_days ADD COLUMN gcash_sales NUMERIC(12, 2);
ALTER TABLE business_days ADD COLUMN maya_sales  NUMERIC(12, 2);
ALTER TABLE business_days ADD COLUMN bank_sales  NUMERIC(12, 2);
