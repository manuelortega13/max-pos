-- Charge-on-account / "creditor" support.
--
-- A creditor is a customer who buys on credit and pays later. The
-- sale is rung up as PAYMENT_METHOD = 'CREDIT', linked to a creditor
-- row via sales.creditor_id, and the creditor's balance (sum of
-- non-refunded credit sales) is tracked server-side.
--
-- This migration only sets up the sell-side. Settlement (recording
-- creditor payments against their balance) is a future feature.

CREATE TABLE creditors (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name     VARCHAR(255) NOT NULL,
    phone         VARCHAR(64)  NOT NULL,
    address       TEXT,
    -- Payment term — when the creditor is expected to settle.
    -- FIFTEENTH = on the 15th of each month, MONTH_END = on the last day.
    payment_term  VARCHAR(16)  NOT NULL CHECK (payment_term IN ('FIFTEENTH', 'MONTH_END')),
    -- NULL credit_limit means "no limit set" — the cashier can ring up
    -- credit sales without any over-limit warning. A value of 0 means
    -- "no credit allowed" and will trip the soft warning on every sale.
    credit_limit  NUMERIC(12, 2) CHECK (credit_limit IS NULL OR credit_limit >= 0),
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_creditors_active ON creditors (active);
CREATE INDEX idx_creditors_name   ON creditors (full_name);

-- Widen the sales.payment_method CHECK constraint so CREDIT is valid.
-- The constraint was defined inline in V1 as
--   CHECK (payment_method IN ('CASH', 'CARD', 'TRANSFER'))
-- with the implicit Postgres name `sales_payment_method_check`.
ALTER TABLE sales DROP CONSTRAINT sales_payment_method_check;
ALTER TABLE sales ADD CONSTRAINT sales_payment_method_check
    CHECK (payment_method IN ('CASH', 'CARD', 'TRANSFER', 'CREDIT'));

-- Link credit sales to a creditor. Nullable for cash/card/transfer.
-- ON DELETE RESTRICT (default) so a creditor with active sales
-- history can't be hard-deleted — the admin must deactivate instead
-- (mirrors the product-delete safety we added in V16).
ALTER TABLE sales
    ADD COLUMN creditor_id UUID REFERENCES creditors(id);

CREATE INDEX idx_sales_creditor ON sales (creditor_id);

-- Symmetry constraint: CREDIT sales must have a creditor; non-CREDIT
-- sales must NOT have one. Catches client bugs that try to attach a
-- creditor to a cash sale or forget to attach one to a credit sale.
ALTER TABLE sales ADD CONSTRAINT sales_credit_creditor_consistent CHECK (
    (payment_method =  'CREDIT' AND creditor_id IS NOT NULL) OR
    (payment_method <> 'CREDIT' AND creditor_id IS NULL)
);

-- Z-report bucket for credit sales. Doesn't touch the cash drawer
-- (CREDIT means "no money exchanged hands today") but admins still
-- want to see the day's credit volume separately from cash/card.
ALTER TABLE business_days
    ADD COLUMN credit_sales NUMERIC(12, 2);
