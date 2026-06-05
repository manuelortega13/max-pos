-- Load on credit (utang).
--
-- Until now every cellphone load was paid cash at the till. This adds
-- a payment_method + creditor_id to load_transactions so a load can be
-- charged to a creditor's account instead, mirroring the CREDIT path
-- that already exists for sales (V18).
--
-- Existing rows backfill to 'CASH' (every historical load was cash).
-- Credit loads feed the creditor's outstanding balance via the
-- Creditor @Formula and book a RECEIVABLES movement on completion;
-- they're excluded from the day's cash-drawer reconciliation.

ALTER TABLE load_transactions
    ADD COLUMN payment_method VARCHAR(16) NOT NULL DEFAULT 'CASH'
        CHECK (payment_method IN ('CASH', 'CREDIT')),
    ADD COLUMN creditor_id    UUID REFERENCES creditors(id);

CREATE INDEX idx_load_transactions_creditor ON load_transactions (creditor_id);

-- Symmetry constraint, same shape as sales_credit_creditor_consistent
-- (V18): CREDIT loads must reference a creditor; CASH loads must not.
ALTER TABLE load_transactions ADD CONSTRAINT load_credit_creditor_consistent CHECK (
    (payment_method =  'CREDIT' AND creditor_id IS NOT NULL) OR
    (payment_method <> 'CREDIT' AND creditor_id IS NULL)
);
