-- Cellphone load service. Customer hands cash, store sends mobile
-- load (e.g. "Unli Calls 50", "All-Net 30 Texts", or just plain
-- credit) to the customer's number. Same workflow shape as GCash
-- cash-in: row created PENDING at the till, admin sends from their
-- phone, then marks COMPLETED.
--
-- Loads are always cash-in for the store (no "load-out" equivalent
-- exists in practice), so there's no direction column on the row.

CREATE TABLE load_fee_tiers (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    min_amount  NUMERIC(12, 2) NOT NULL CHECK (min_amount >= 0),
    max_amount  NUMERIC(12, 2) NOT NULL CHECK (max_amount >  min_amount),
    fee         NUMERIC(12, 2) NOT NULL CHECK (fee        >= 0),
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_load_fee_tiers_active_range ON load_fee_tiers (active, min_amount);

-- One transaction = one customer encounter.
--
-- Phone is required (destination GCash/load number — without it the
-- admin can't actually send the load), promo is optional plain text
-- (e.g. "Unli Calls 50", "GoSURF 99"). Reference uses the L-YYYYMMDD-N
-- format to distinguish from GCash (G-) rows in receipts and logs.
CREATE TABLE load_transactions (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    amount            NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    fee               NUMERIC(12, 2) NOT NULL CHECK (fee    >= 0),
    promo             VARCHAR(255),
    customer_phone    VARCHAR(64)  NOT NULL,
    -- Two-state workflow. PENDING on create (cash collected at till,
    -- load still to be sent); admin flips to COMPLETED after sending.
    status            VARCHAR(16)  NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING', 'COMPLETED')),
    completed_at      TIMESTAMPTZ,
    completed_by      UUID         REFERENCES users(id),
    cashier_id        UUID         NOT NULL REFERENCES users(id),
    business_day_id   UUID         REFERENCES business_days(id) ON DELETE SET NULL,
    date              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    reference         VARCHAR(64)  NOT NULL UNIQUE,
    notes             TEXT,
    voided_at         TIMESTAMPTZ,
    voided_by         UUID         REFERENCES users(id),
    CONSTRAINT load_transactions_void_consistent CHECK (
        (voided_at IS NULL AND voided_by IS NULL) OR
        (voided_at IS NOT NULL AND voided_by IS NOT NULL)
    ),
    CONSTRAINT load_transactions_completed_consistent CHECK (
        (status = 'PENDING'   AND completed_at IS NULL  AND completed_by IS NULL) OR
        (status = 'COMPLETED' AND completed_at IS NOT NULL AND completed_by IS NOT NULL)
    )
);

CREATE INDEX idx_load_transactions_cashier      ON load_transactions (cashier_id);
CREATE INDEX idx_load_transactions_business_day ON load_transactions (business_day_id);
CREATE INDEX idx_load_transactions_date         ON load_transactions (date DESC);

-- Partial index — the admin work queue only ever looks at the
-- pending slice, so this keeps that query cheap as completed rows
-- accumulate.
CREATE INDEX idx_load_transactions_pending
    ON load_transactions (date DESC)
    WHERE status = 'PENDING' AND voided_at IS NULL;

-- Z-report buckets. Cash-in adds (amount + fee) to the till, same
-- shape as GCash cash-in. Two columns so volume and fee revenue
-- show separately on the closing report.
ALTER TABLE business_days
    ADD COLUMN load_amount NUMERIC(12, 2),
    ADD COLUMN load_fees   NUMERIC(12, 2);
