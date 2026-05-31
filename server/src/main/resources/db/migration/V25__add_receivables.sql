-- Receivables ledger.
--
-- Treats outstanding money owed by creditors as a first-class finance
-- account, alongside Cash / GCash / Maya / Bank / Load wallet. The
-- balance equals the running total of (credit sales) − (creditor
-- payments), mirroring Creditor.outstandingBalance but viewable in
-- the unified Finance ledger and drill-in.

-- ─── Allow RECEIVABLES as an account kind ────────────────────────────
-- The CHECK constraint added inline by V24 is auto-named by Postgres
-- (typically accounts_kind_check). Resolve the name dynamically so a
-- non-standard naming won't break the migration.
DO $$
DECLARE
    cname text;
BEGIN
    SELECT con.conname INTO cname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
     WHERE rel.relname = 'accounts'
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%kind%CASH%';
    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE accounts DROP CONSTRAINT %I', cname);
    END IF;
END $$;

ALTER TABLE accounts ADD CONSTRAINT accounts_kind_check
    CHECK (kind IN ('CASH', 'GCASH', 'MAYA', 'BANK', 'LOAD_WALLET', 'OTHER', 'RECEIVABLES'));

-- ─── Seed the Receivables account ────────────────────────────────────
-- sort_order = 90 places it after the on-hand wallets (10–50) and
-- before any ad-hoc OTHER accounts admins might add. One row per
-- store; admins can rename but not delete.
INSERT INTO accounts (name, kind, sort_order) VALUES
    ('Receivables', 'RECEIVABLES', 90);

-- ─── Backfill from historical sale + payment rows ────────────────────
-- Every non-refunded credit sale raised the receivable; every
-- non-voided creditor payment paid it down. Net of the two equals
-- the current outstanding balance.
DO $$
DECLARE
    v_receivables UUID;
BEGIN
    SELECT id INTO v_receivables FROM accounts WHERE kind = 'RECEIVABLES' LIMIT 1;

    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT v_receivables, 'IN', s.total, 'CREDIT_SALE',
           'Credit sale ' || s.reference, s.date, s.cashier_id, 'SALE', s.id
      FROM sales s
     WHERE s.payment_method = 'CREDIT' AND s.status = 'COMPLETED';

    INSERT INTO account_movements
        (account_id, direction, amount, category, note, occurred_at,
         recorded_by, source_kind, source_id)
    SELECT v_receivables, 'OUT', p.amount, 'CREDIT_PAYMENT',
           'Credit payment ' || p.reference, p.date, p.cashier_id, 'CREDITOR_PAYMENT', p.id
      FROM creditor_payments p
     WHERE p.voided_at IS NULL;
END $$;
