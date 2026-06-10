-- Offline idempotency key for GCash + Load transactions.
--
-- The cashier register can ring up GCash and Load transactions while the
-- network is down: the request is queued client-side and replayed when the
-- connection returns (mirrors the sales offline queue). A replayed POST after
-- a lost response must not create a duplicate row, so the client stamps each
-- queued transaction with a UUID-based client_ref and the service dedupes on
-- it (see GcashTransactionService/LoadTransactionService.create).
--
-- Unlike sales (which overload `reference` as the idempotency key), we keep a
-- SEPARATE column here so the human-facing `reference` keeps its
-- G-YYYYMMDD-NNNNN / L-YYYYMMDD-NNNNN format on receipts and reports. The
-- register stamps every new transaction (online and offline) with a clientRef
-- so even a first online POST whose response was lost can be safely replayed.
--
-- The column is nullable so pre-existing rows (created before this column) and
-- any future server-only inserts don't need a value; a partial unique index
-- (WHERE client_ref IS NOT NULL) enforces idempotency without forcing those
-- legacy rows to carry one.

ALTER TABLE gcash_transactions ADD COLUMN client_ref VARCHAR(64);
CREATE UNIQUE INDEX ux_gcash_transactions_client_ref
    ON gcash_transactions (client_ref)
    WHERE client_ref IS NOT NULL;

ALTER TABLE load_transactions ADD COLUMN client_ref VARCHAR(64);
CREATE UNIQUE INDEX ux_load_transactions_client_ref
    ON load_transactions (client_ref)
    WHERE client_ref IS NOT NULL;
