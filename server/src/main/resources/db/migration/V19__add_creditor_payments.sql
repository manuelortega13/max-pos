-- Creditor payments — when a customer pays down their credit
-- balance. Separate from sales: a credit sale INCREASES the
-- creditor's balance, a payment DECREASES it. Cash payments also
-- increase the till, so the cash-drawer math at End-of-Day picks
-- them up.

CREATE TABLE creditor_payments (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    creditor_id       UUID         NOT NULL REFERENCES creditors(id),
    amount            NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    -- Methods the customer can use to pay down their balance. CREDIT
    -- is intentionally excluded — you can't pay credit with credit.
    payment_method    VARCHAR(16)  NOT NULL CHECK (payment_method IN ('CASH', 'CARD', 'TRANSFER')),
    cashier_id        UUID         NOT NULL REFERENCES users(id),
    -- The open business day at the time of recording. Nullable for
    -- the same offline-replay reasons sales.business_day_id is.
    business_day_id   UUID         REFERENCES business_days(id) ON DELETE SET NULL,
    date              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    reference         VARCHAR(64)  NOT NULL UNIQUE,
    notes             TEXT,
    -- Soft-delete: admin can void a mis-keyed payment, restoring the
    -- creditor's balance. The @Formula on Creditor.outstandingBalance
    -- excludes voided payments, and Z-report aggregation does the same.
    voided_at         TIMESTAMPTZ,
    voided_by         UUID         REFERENCES users(id),
    CONSTRAINT creditor_payments_void_consistent CHECK (
        (voided_at IS NULL AND voided_by IS NULL) OR
        (voided_at IS NOT NULL AND voided_by IS NOT NULL)
    )
);

CREATE INDEX idx_creditor_payments_creditor ON creditor_payments (creditor_id);
CREATE INDEX idx_creditor_payments_business_day ON creditor_payments (business_day_id);
CREATE INDEX idx_creditor_payments_date ON creditor_payments (date DESC);

-- Z-report bucket for cash payments collected. Card / transfer
-- payments are tracked at the payment row but don't enter the cash-
-- drawer reconciliation. Mirrors the existing snapshot columns.
ALTER TABLE business_days
    ADD COLUMN cash_credit_payments NUMERIC(12, 2);
