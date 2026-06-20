-- ─────────────────────────────────────────────────────────────────────────
-- Multi-store — Phase 2: make uniqueness per-store.
--
-- Identifiers that were globally unique must become unique *within a store*
-- so two stores can each have e.g. SKU "BIS-001" or sale ref "S-000123".
-- For the single existing store every per-store constraint is satisfied by
-- the same rows that satisfied the global one, so this is non-destructive.
--
-- Deliberately NOT changed:
--   • users.email stays globally unique (one user → one store by decision).
--   • push_subscriptions(user_id, endpoint) is already user-scoped.
--
-- ddl-auto=validate does not inspect unique constraints, so this has no
-- effect on the running (not-yet-tenant-aware) app.
-- ─────────────────────────────────────────────────────────────────────────

-- Products: SKU unique per store.
ALTER TABLE products DROP CONSTRAINT products_sku_key;
ALTER TABLE products ADD CONSTRAINT ux_products_store_sku UNIQUE (store_id, sku);

-- Product barcodes: scan code unique per store.
ALTER TABLE product_barcodes DROP CONSTRAINT product_barcodes_code_key;
ALTER TABLE product_barcodes ADD CONSTRAINT ux_product_barcodes_store_code UNIQUE (store_id, code);

-- Categories & accounts: name unique per store.
ALTER TABLE categories DROP CONSTRAINT categories_name_key;
ALTER TABLE categories ADD CONSTRAINT ux_categories_store_name UNIQUE (store_id, name);

ALTER TABLE accounts DROP CONSTRAINT accounts_name_key;
ALTER TABLE accounts ADD CONSTRAINT ux_accounts_store_name UNIQUE (store_id, name);

-- Transaction references: unique per store.
ALTER TABLE sales DROP CONSTRAINT sales_reference_key;
ALTER TABLE sales ADD CONSTRAINT ux_sales_store_reference UNIQUE (store_id, reference);

ALTER TABLE creditor_payments DROP CONSTRAINT creditor_payments_reference_key;
ALTER TABLE creditor_payments ADD CONSTRAINT ux_creditor_payments_store_reference UNIQUE (store_id, reference);

ALTER TABLE gcash_transactions DROP CONSTRAINT gcash_transactions_reference_key;
ALTER TABLE gcash_transactions ADD CONSTRAINT ux_gcash_store_reference UNIQUE (store_id, reference);

ALTER TABLE load_transactions DROP CONSTRAINT load_transactions_reference_key;
ALTER TABLE load_transactions ADD CONSTRAINT ux_load_store_reference UNIQUE (store_id, reference);

-- Offline-replay idempotency keys: unique per store (partial — only when set).
DROP INDEX ux_gcash_transactions_client_ref;
CREATE UNIQUE INDEX ux_gcash_transactions_client_ref
    ON gcash_transactions (store_id, client_ref) WHERE client_ref IS NOT NULL;

DROP INDEX ux_load_transactions_client_ref;
CREATE UNIQUE INDEX ux_load_transactions_client_ref
    ON load_transactions (store_id, client_ref) WHERE client_ref IS NOT NULL;

-- One OPEN business day per store (was one globally).
DROP INDEX uniq_business_days_open;
CREATE UNIQUE INDEX uniq_business_days_open
    ON business_days (store_id) WHERE closed_at IS NULL;

-- Store settings: drop the single-row (id = 1) guard and make it one row
-- per store. The existing row keeps id = 1 so the current app's
-- findById(1) lookup is unaffected; the tenant-aware per-store lookup and
-- id generation for new stores arrive in later phases.
ALTER TABLE store_settings DROP CONSTRAINT store_settings_id_check;
ALTER TABLE store_settings ADD CONSTRAINT ux_store_settings_store UNIQUE (store_id);
