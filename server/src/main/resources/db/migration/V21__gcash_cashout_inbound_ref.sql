-- Cash-out doesn't need the customer's name or phone (we already
-- got the money — the customer's GCash app showed them what to
-- send to). What we DO need is enough of the GCash transaction
-- reference to reconcile against the inbound message later.
--
-- Stored as free text so the cashier can paste the last 6 chars
-- (the GCash "Ref no." tail) or the full ID — whichever shows on
-- their phone at the till.
--
-- Written idempotently with IF [NOT] EXISTS guards so it can recover
-- cleanly from a partial prior run — production hit a CHECK violation
-- on the first deploy (pre-existing CASH_OUT rows had no inbound_ref),
-- and we need to be safe whether the failed attempt left half of the
-- DDL behind or rolled back fully.

ALTER TABLE gcash_transactions
    ADD COLUMN IF NOT EXISTS inbound_ref VARCHAR(64);

-- Backfill any CASH_OUT rows that pre-date this migration. The CHECK
-- below would reject them; seeding 'LEGACY' lets the constraint hold
-- without losing the historical rows. New rows get the real value
-- from the cashier UI (the dialog requires phone for CASH_IN and
-- inbound_ref for CASH_OUT before submit).
UPDATE gcash_transactions
   SET inbound_ref = 'LEGACY'
 WHERE type = 'CASH_OUT' AND inbound_ref IS NULL;

-- Cash-out requires inbound_ref; cash-in must NOT have one (the
-- inbound side hasn't happened yet — admin will send later from
-- their phone). DROP IF EXISTS guards against a partial earlier run.
ALTER TABLE gcash_transactions
   DROP CONSTRAINT IF EXISTS gcash_transactions_cashout_needs_inbound_ref;

ALTER TABLE gcash_transactions
   ADD CONSTRAINT gcash_transactions_cashout_needs_inbound_ref CHECK (
       (type = 'CASH_OUT' AND inbound_ref IS NOT NULL) OR
       (type = 'CASH_IN'  AND inbound_ref IS NULL)
   );
