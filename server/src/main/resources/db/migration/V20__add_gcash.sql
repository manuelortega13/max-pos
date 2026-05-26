-- GCash cash-in / cash-out service. Stores act as walk-in
-- e-wallet kiosks: customer hands cash (or sends from their GCash);
-- cashier executes the matching GCash transaction on their phone
-- and records the encounter here, charging a service fee taken
-- from an admin-configured tier table.
--
-- Tiers are shared between cash-in and cash-out — same fee schedule
-- for both directions. Transactions are typed at the row level.

CREATE TABLE gcash_fee_tiers (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    min_amount  NUMERIC(12, 2) NOT NULL CHECK (min_amount >= 0),
    max_amount  NUMERIC(12, 2) NOT NULL CHECK (max_amount >  min_amount),
    fee         NUMERIC(12, 2) NOT NULL CHECK (fee        >= 0),
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_gcash_fee_tiers_active_range ON gcash_fee_tiers (active, min_amount);

-- One transaction = one customer encounter. `type` separates
-- cash-in (customer hands cash, store sends GCash) from cash-out
-- (customer sends GCash, store hands cash). Fee is captured at
-- the row level — if the amount matched a tier, the cashier UI
-- locks it to tier.fee; if no tier covered the amount the cashier
-- enters the fee manually (server accepts whatever they record).
--
-- Customer phone is required for CASH_IN (cashier needs to know
-- which GCash number to send to); optional for CASH_OUT (the
-- customer sends to the store's GCash so the store already has
-- the inbound reference).
CREATE TABLE gcash_transactions (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    type              VARCHAR(16)  NOT NULL CHECK (type IN ('CASH_IN', 'CASH_OUT')),
    amount            NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    fee               NUMERIC(12, 2) NOT NULL CHECK (fee    >= 0),
    -- Two-state workflow. Cash-in starts PENDING (cash collected at
    -- till, GCash still to be sent by admin from their phone); admin
    -- flips to COMPLETED after sending. Cash-out is COMPLETED on
    -- create — the cashier verifies the inbound GCash before handing
    -- cash, so the operation finishes at the till.
    status            VARCHAR(16)  NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING', 'COMPLETED')),
    completed_at      TIMESTAMPTZ,
    completed_by      UUID         REFERENCES users(id),
    customer_name     VARCHAR(255),
    customer_phone    VARCHAR(64),
    cashier_id        UUID         NOT NULL REFERENCES users(id),
    business_day_id   UUID         REFERENCES business_days(id) ON DELETE SET NULL,
    date              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    reference         VARCHAR(64)  NOT NULL UNIQUE,
    notes             TEXT,
    voided_at         TIMESTAMPTZ,
    voided_by         UUID         REFERENCES users(id),
    CONSTRAINT gcash_transactions_void_consistent CHECK (
        (voided_at IS NULL AND voided_by IS NULL) OR
        (voided_at IS NOT NULL AND voided_by IS NOT NULL)
    ),
    CONSTRAINT gcash_transactions_completed_consistent CHECK (
        (status = 'PENDING'   AND completed_at IS NULL  AND completed_by IS NULL) OR
        (status = 'COMPLETED' AND completed_at IS NOT NULL AND completed_by IS NOT NULL)
    ),
    CONSTRAINT gcash_transactions_cashin_needs_phone CHECK (
        type <> 'CASH_IN' OR customer_phone IS NOT NULL
    )
);

-- Admin Cash-ins tab queries by status — narrow index keeps the
-- PENDING work-queue view fast even as completed rows accumulate.
CREATE INDEX idx_gcash_transactions_pending
    ON gcash_transactions (date DESC)
    WHERE status = 'PENDING' AND voided_at IS NULL;

CREATE INDEX idx_gcash_transactions_cashier      ON gcash_transactions (cashier_id);
CREATE INDEX idx_gcash_transactions_business_day ON gcash_transactions (business_day_id);
CREATE INDEX idx_gcash_transactions_date         ON gcash_transactions (date DESC);

-- Z-report buckets per direction. Cash-in adds (amount + fee) to
-- the till; cash-out removes amount but keeps fee. Storing the four
-- pieces separately lets the report show volume cleanly.
ALTER TABLE business_days
    ADD COLUMN gcash_cash_in_amount  NUMERIC(12, 2),
    ADD COLUMN gcash_cash_in_fees    NUMERIC(12, 2),
    ADD COLUMN gcash_cash_out_amount NUMERIC(12, 2),
    ADD COLUMN gcash_cash_out_fees   NUMERIC(12, 2);
