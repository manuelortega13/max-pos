-- Cash-out doesn't need the customer's name or phone (we already
-- got the money — the customer's GCash app showed them what to
-- send to). What we DO need is enough of the GCash transaction
-- reference to reconcile against the inbound message later.
--
-- Stored as free text so the cashier can paste the last 6 chars
-- (the GCash "Ref no." tail) or the full ID — whichever shows on
-- their phone at the till.

ALTER TABLE gcash_transactions
    ADD COLUMN inbound_ref VARCHAR(64);

-- Cash-out requires inbound_ref; cash-in must NOT have one (the
-- inbound side hasn't happened yet — admin will send later from
-- their phone).
ALTER TABLE gcash_transactions
    ADD CONSTRAINT gcash_transactions_cashout_needs_inbound_ref CHECK (
        (type = 'CASH_OUT' AND inbound_ref IS NOT NULL) OR
        (type = 'CASH_IN'  AND inbound_ref IS NULL)
    );
