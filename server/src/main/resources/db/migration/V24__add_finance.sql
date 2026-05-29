-- Finance / Treasury ledger.
--
-- Models the business's money across multiple accounts (Cash, GCash,
-- Maya, bank, load wallet, ad-hoc). Every event that moves money in
-- or out of any account writes a row into account_movements — this
-- denormalized ledger is the single source of truth for balances and
-- the movement feed. Reconciliations record count-and-confirm events
-- per account; each one also writes a paired adjustment movement so
-- the running-balance math stays uniform regardless of variance.
--
-- Auto-tracked movements (one per source row, written by Java service
-- layer at create/refund/void time):
--   SALE              cash/card/transfer/credit sale          → +IN
--   REFUND            refunded sale                            → +OUT (same account as the sale)
--   GCASH_TXN         cash-in: Cash +amount+fee, GCash -amount
--                     cash-out: Cash -amount+fee, GCash +amount
--   LOAD_TXN          Cash +amount+fee, LoadWallet -amount
--   EXPENSE           Account -amount (account chosen on the expense row)
--   CREDITOR_PAYMENT  Account +amount (account inferred from payment method)
--   FLOAT_ADDITION    Cash +amount
--   OPENING_FLOAT     Cash +amount (one per business-day open)
--   MANUAL            cash deposit/withdrawal recorded directly by admin
--   TRANSFER          paired pair of OUT/IN rows linked via transfer_pair_id
--   RECONCILE         variance adjustment paired with a row in account_reconciliations

-- ─── Accounts ────────────────────────────────────────────────────────
CREATE TABLE accounts (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(64)  NOT NULL,
    kind        VARCHAR(16)  NOT NULL
                CHECK (kind IN ('CASH', 'GCASH', 'MAYA', 'BANK', 'LOAD_WALLET', 'OTHER')),
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (name)
);

CREATE INDEX idx_accounts_active_sort ON accounts (active, sort_order, name);

-- Seed the typical accounts every store needs. The owner can add
-- more (e.g., a second bank) or rename via the admin UI.
INSERT INTO accounts (name, kind, sort_order) VALUES
    ('Cash',        'CASH',        10),
    ('GCash',       'GCASH',       20),
    ('Maya',        'MAYA',        30),
    ('Bank',        'BANK',        40),
    ('Load wallet', 'LOAD_WALLET', 50);

-- ─── Movement ledger ────────────────────────────────────────────────
CREATE TABLE account_movements (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id        UUID         NOT NULL REFERENCES accounts(id),
    direction         VARCHAR(4)   NOT NULL CHECK (direction IN ('IN', 'OUT')),
    amount            NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    -- Display label / grouping bucket for the movement feed and the
    -- breakdown panel. Examples: 'CASH_SALE', 'GCASH_FEE', 'OWNER_DEPOSIT',
    -- 'BANK_DEPOSIT', 'RECONCILE_ADJUSTMENT'. Kept as free-text VARCHAR
    -- (not enum) so we can add new categories without a migration.
    category          VARCHAR(32)  NOT NULL,
    note              TEXT,
    occurred_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- Who triggered the movement. Auto-tracked movements inherit the
    -- cashier/admin who created the source row; manual entries point
    -- at the admin who recorded them.
    recorded_by       UUID         REFERENCES users(id),
    source_kind       VARCHAR(20)  NOT NULL CHECK (source_kind IN (
        'SALE', 'REFUND', 'GCASH_TXN', 'LOAD_TXN', 'EXPENSE',
        'CREDITOR_PAYMENT', 'FLOAT_ADDITION', 'OPENING_FLOAT',
        'MANUAL', 'TRANSFER', 'RECONCILE'
    )),
    -- FK to the source row (sales.id, gcash_transactions.id, etc.).
    -- Null for MANUAL / RECONCILE rows that have no separate source.
    source_id         UUID,
    -- For TRANSFER source_kind: links the OUT side to its paired IN
    -- side (and vice versa). Null otherwise. Self-referencing so we
    -- can chase the pair without a second table.
    transfer_pair_id  UUID         REFERENCES account_movements(id),
    voided_at         TIMESTAMPTZ,
    voided_by         UUID         REFERENCES users(id),
    CONSTRAINT account_movements_void_consistent CHECK (
        (voided_at IS NULL AND voided_by IS NULL) OR
        (voided_at IS NOT NULL AND voided_by IS NOT NULL)
    )
);

-- Balance computation: SUM by account, filtered to non-voided rows.
CREATE INDEX idx_account_movements_account_time
    ON account_movements (account_id, occurred_at DESC)
    WHERE voided_at IS NULL;

-- Source-row lookup: void cascade, idempotency checks on auto-track.
CREATE INDEX idx_account_movements_source
    ON account_movements (source_kind, source_id)
    WHERE source_id IS NOT NULL;

-- ─── Account reconciliations ─────────────────────────────────────────
CREATE TABLE account_reconciliations (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID         NOT NULL REFERENCES accounts(id),
    counted_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    counted_by      UUID         NOT NULL REFERENCES users(id),
    expected_amount NUMERIC(12, 2) NOT NULL,
    counted_amount  NUMERIC(12, 2) NOT NULL,
    -- Persisted (= counted - expected) for query convenience. Sign
    -- shows direction: positive = over, negative = short.
    variance        NUMERIC(12, 2) NOT NULL,
    note            TEXT,
    -- Link to the variance-adjustment movement created by the same
    -- reconciliation (null when variance is exactly zero — no
    -- adjustment needed).
    adjustment_movement_id UUID REFERENCES account_movements(id),
    voided_at       TIMESTAMPTZ,
    voided_by       UUID         REFERENCES users(id),
    CONSTRAINT account_reconciliations_void_consistent CHECK (
        (voided_at IS NULL AND voided_by IS NULL) OR
        (voided_at IS NOT NULL AND voided_by IS NOT NULL)
    )
);

CREATE INDEX idx_account_reconciliations_account_time
    ON account_reconciliations (account_id, counted_at DESC);

-- ─── Expense payment_account_id ──────────────────────────────────────
-- Existing expenses didn't track which account paid for them. Adding
-- the FK now; back-fill historical rows to Cash (matches the typical
-- small-business pattern where most ad-hoc expenses are paid in cash).
ALTER TABLE expenses
    ADD COLUMN payment_account_id UUID REFERENCES accounts(id);

UPDATE expenses
   SET payment_account_id = (SELECT id FROM accounts WHERE kind = 'CASH' LIMIT 1)
 WHERE payment_account_id IS NULL;

ALTER TABLE expenses
    ALTER COLUMN payment_account_id SET NOT NULL;

-- ─── Store settings: global card/transfer account mapping ────────────
-- Card and transfer sales don't have an inherent target account
-- (unlike cash sales which always go to Cash, and GCash transactions
-- which always involve the GCash account). Admin picks the default
-- destination once in Settings; auto-tracking honors it.
ALTER TABLE store_settings
    ADD COLUMN card_account_id     UUID REFERENCES accounts(id),
    ADD COLUMN transfer_account_id UUID REFERENCES accounts(id);

-- Sensible defaults: Card → Bank, Transfer → GCash.
UPDATE store_settings
   SET card_account_id     = (SELECT id FROM accounts WHERE kind = 'BANK'  LIMIT 1),
       transfer_account_id = (SELECT id FROM accounts WHERE kind = 'GCASH' LIMIT 1);

-- ─── Backfill account_movements from existing event tables ───────────
-- These INSERT-SELECTs project the historical event tables into the
-- new ledger so day-one balances reflect the data already in the
-- system. Ordering doesn't strictly matter (the ledger is summed,
-- not replayed) but we group by source for readability.

-- Resolve account ids into PL/pgSQL variables for clarity. Done as a
-- DO block so we can reference the seeded ids without subqueries in
-- every INSERT.
DO $$
DECLARE
    v_cash        UUID;
    v_gcash       UUID;
    v_load_wallet UUID;
    v_card_dest   UUID;
    v_transfer_dest UUID;
BEGIN
    SELECT id INTO v_cash        FROM accounts WHERE kind = 'CASH'        LIMIT 1;
    SELECT id INTO v_gcash       FROM accounts WHERE kind = 'GCASH'       LIMIT 1;
    SELECT id INTO v_load_wallet FROM accounts WHERE kind = 'LOAD_WALLET' LIMIT 1;
    SELECT card_account_id, transfer_account_id
      INTO v_card_dest, v_transfer_dest
      FROM store_settings WHERE id = 1;

    -- Sales (completed, by payment method)
    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT v_cash, 'IN', s.total, 'CASH_SALE',
           'Sale ' || s.reference, s.date, s.cashier_id, 'SALE', s.id
      FROM sales s
     WHERE s.payment_method = 'CASH' AND s.status = 'COMPLETED';

    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT v_card_dest, 'IN', s.total, 'CARD_SALE',
           'Sale ' || s.reference, s.date, s.cashier_id, 'SALE', s.id
      FROM sales s
     WHERE s.payment_method = 'CARD' AND s.status = 'COMPLETED' AND v_card_dest IS NOT NULL;

    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT v_transfer_dest, 'IN', s.total, 'TRANSFER_SALE',
           'Sale ' || s.reference, s.date, s.cashier_id, 'SALE', s.id
      FROM sales s
     WHERE s.payment_method = 'TRANSFER' AND s.status = 'COMPLETED' AND v_transfer_dest IS NOT NULL;

    -- Refunds (cash only — card / transfer refunds settle in the
    -- bank, not the till; we don't auto-track those movements without
    -- richer settlement data).
    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT v_cash, 'OUT', s.total, 'CASH_REFUND',
           'Refund of ' || s.reference, s.date, s.cashier_id, 'REFUND', s.id
      FROM sales s
     WHERE s.payment_method = 'CASH' AND s.status = 'REFUNDED';

    -- GCash cash-in: customer hands cash, store sends GCash.
    -- Cash gains (amount + fee), GCash loses amount.
    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT v_cash, 'IN', g.amount + g.fee, 'GCASH_CASH_IN',
           'GCash cash-in ' || g.reference, g.date, g.cashier_id, 'GCASH_TXN', g.id
      FROM gcash_transactions g
     WHERE g.type = 'CASH_IN' AND g.voided_at IS NULL;

    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT v_gcash, 'OUT', g.amount, 'GCASH_CASH_IN',
           'GCash cash-in ' || g.reference, g.date, g.cashier_id, 'GCASH_TXN', g.id
      FROM gcash_transactions g
     WHERE g.type = 'CASH_IN' AND g.voided_at IS NULL;

    -- GCash cash-out: customer sends GCash, store hands cash.
    -- Cash loses amount but gains fee (one IN row for fee, one OUT
    -- row for the cash given out); GCash gains amount.
    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT v_cash, 'OUT', g.amount, 'GCASH_CASH_OUT',
           'GCash cash-out ' || g.reference, g.date, g.cashier_id, 'GCASH_TXN', g.id
      FROM gcash_transactions g
     WHERE g.type = 'CASH_OUT' AND g.voided_at IS NULL;

    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT v_cash, 'IN', g.fee, 'GCASH_FEE',
           'GCash cash-out fee ' || g.reference, g.date, g.cashier_id, 'GCASH_TXN', g.id
      FROM gcash_transactions g
     WHERE g.type = 'CASH_OUT' AND g.voided_at IS NULL AND g.fee > 0;

    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT v_gcash, 'IN', g.amount, 'GCASH_CASH_OUT',
           'GCash cash-out ' || g.reference, g.date, g.cashier_id, 'GCASH_TXN', g.id
      FROM gcash_transactions g
     WHERE g.type = 'CASH_OUT' AND g.voided_at IS NULL;

    -- Load: customer hands cash, store deducts load credit from its
    -- prepaid wallet. Cash +(amount + fee), Load wallet -amount.
    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT v_cash, 'IN', l.amount + l.fee, 'LOAD_SALE',
           'Load ' || l.reference, l.date, l.cashier_id, 'LOAD_TXN', l.id
      FROM load_transactions l
     WHERE l.voided_at IS NULL;

    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT v_load_wallet, 'OUT', l.amount, 'LOAD_SALE',
           'Load ' || l.reference, l.date, l.cashier_id, 'LOAD_TXN', l.id
      FROM load_transactions l
     WHERE l.voided_at IS NULL;

    -- Creditor payments (cash only — card/transfer credit payments
    -- settle in the bank, not the till; treat them like card sales
    -- and route to the card-destination account if set).
    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT v_cash, 'IN', p.amount, 'CREDIT_PAYMENT',
           'Credit payment ' || p.reference, p.date, p.cashier_id, 'CREDITOR_PAYMENT', p.id
      FROM creditor_payments p
     WHERE p.payment_method = 'CASH' AND p.voided_at IS NULL;

    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT v_card_dest, 'IN', p.amount, 'CREDIT_PAYMENT',
           'Credit payment ' || p.reference, p.date, p.cashier_id, 'CREDITOR_PAYMENT', p.id
      FROM creditor_payments p
     WHERE p.payment_method = 'CARD' AND p.voided_at IS NULL AND v_card_dest IS NOT NULL;

    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT v_transfer_dest, 'IN', p.amount, 'CREDIT_PAYMENT',
           'Credit payment ' || p.reference, p.date, p.cashier_id, 'CREDITOR_PAYMENT', p.id
      FROM creditor_payments p
     WHERE p.payment_method = 'TRANSFER' AND p.voided_at IS NULL AND v_transfer_dest IS NOT NULL;

    -- Float top-ups & opening floats: all to Cash.
    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT v_cash, 'IN', a.amount, 'FLOAT_TOPUP',
           COALESCE(a.note, 'Mid-day float top-up'), a.added_at, a.added_by, 'FLOAT_ADDITION', a.id
      FROM business_day_float_additions a
     WHERE a.voided_at IS NULL;

    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT v_cash, 'IN', d.opening_float, 'OPENING_FLOAT',
           'Opening float', d.opened_at, d.opened_by, 'OPENING_FLOAT', d.id
      FROM business_days d
     WHERE d.opening_float > 0;

    -- Expenses (using each expense's chosen payment account).
    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT e.payment_account_id, 'OUT', e.amount,
           COALESCE(NULLIF(e.category, ''), 'EXPENSE'),
           e.description, e.created_at, e.created_by, 'EXPENSE', e.id
      FROM expenses e;
END $$;
