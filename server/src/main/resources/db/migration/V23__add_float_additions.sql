-- Mid-day cash top-ups for the opening float. The owner sometimes
-- realizes they need more change in the till after the day is open
-- (typical: ran out of small bills for change after a few sales).
-- Each top-up is its own row so the End-of-Day reconciliation can
-- show the additions separately and the cash drawer math stays
-- traceable.
--
-- Voided rows are excluded from the expectedCash aggregate, same
-- pattern as creditor_payments and gcash_transactions.

CREATE TABLE business_day_float_additions (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    business_day_id   UUID         NOT NULL REFERENCES business_days(id) ON DELETE CASCADE,
    amount            NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    note              TEXT,
    added_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    added_by          UUID         NOT NULL REFERENCES users(id),
    voided_at         TIMESTAMPTZ,
    voided_by         UUID         REFERENCES users(id),
    CONSTRAINT float_additions_void_consistent CHECK (
        (voided_at IS NULL AND voided_by IS NULL) OR
        (voided_at IS NOT NULL AND voided_by IS NOT NULL)
    )
);

CREATE INDEX idx_float_additions_day ON business_day_float_additions (business_day_id);

-- Frozen snapshot column on business_days. Populated at close time
-- by BusinessDayService.close, same pattern as cash_credit_payments
-- and the gcash/load buckets.
ALTER TABLE business_days
    ADD COLUMN float_additions NUMERIC(12, 2);
