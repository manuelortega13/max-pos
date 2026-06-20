-- ─────────────────────────────────────────────────────────────────────────
-- Multi-store — Phase 1 (cont.): add store_id to every tenant-owned table.
--
-- Each column is NOT NULL DEFAULT the default store (see V32):
--   • existing rows auto-backfill to the default store (no data moves);
--   • the live, not-yet-tenant-aware app keeps inserting fine — legacy
--     INSERTs that omit store_id land on the default store;
--   • adding a NOT NULL column with a CONSTANT default is a metadata-only
--     change in PostgreSQL (no full table rewrite), so it's fast even on
--     the big tables (sales, sale_items, account_movements).
--
-- Hibernate runs with ddl-auto=validate; an extra DB column that the
-- entities don't yet map is tolerated, so this migration does not affect
-- the running application. The entities gain @TenantId in a later phase.
--
-- The DEFAULT is intentionally temporary scaffolding; a later phase drops
-- it once the application sets store_id explicitly on every insert.
-- ─────────────────────────────────────────────────────────────────────────

-- One statement per table, kept explicit (not generated) so the set of
-- tenant tables is auditable here. 21 tenant tables; flyway_schema_history
-- is deliberately excluded.

ALTER TABLE accounts                     ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE account_movements            ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE account_reconciliations      ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE business_days                ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE business_day_float_additions ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE categories                   ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE creditors                    ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE creditor_payments            ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE expenses                     ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE gcash_fee_tiers              ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE gcash_transactions           ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE load_fee_tiers               ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE load_transactions            ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE product_barcodes             ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE product_batches              ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE products                     ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE push_subscriptions           ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE sale_items                   ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE sales                        ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE store_settings               ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);
ALTER TABLE users                        ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES stores(id);

-- Indexes for tenant-scoped lookups (every query will filter by store_id).
CREATE INDEX idx_accounts_store                     ON accounts(store_id);
CREATE INDEX idx_account_movements_store            ON account_movements(store_id);
CREATE INDEX idx_account_reconciliations_store      ON account_reconciliations(store_id);
CREATE INDEX idx_business_days_store                ON business_days(store_id);
CREATE INDEX idx_business_day_float_additions_store ON business_day_float_additions(store_id);
CREATE INDEX idx_categories_store                   ON categories(store_id);
CREATE INDEX idx_creditors_store                    ON creditors(store_id);
CREATE INDEX idx_creditor_payments_store            ON creditor_payments(store_id);
CREATE INDEX idx_expenses_store                     ON expenses(store_id);
CREATE INDEX idx_gcash_fee_tiers_store              ON gcash_fee_tiers(store_id);
CREATE INDEX idx_gcash_transactions_store           ON gcash_transactions(store_id);
CREATE INDEX idx_load_fee_tiers_store               ON load_fee_tiers(store_id);
CREATE INDEX idx_load_transactions_store            ON load_transactions(store_id);
CREATE INDEX idx_product_barcodes_store             ON product_barcodes(store_id);
CREATE INDEX idx_product_batches_store              ON product_batches(store_id);
CREATE INDEX idx_products_store                     ON products(store_id);
CREATE INDEX idx_push_subscriptions_store           ON push_subscriptions(store_id);
CREATE INDEX idx_sale_items_store                   ON sale_items(store_id);
CREATE INDEX idx_sales_store                        ON sales(store_id);
CREATE INDEX idx_store_settings_store               ON store_settings(store_id);
CREATE INDEX idx_users_store                        ON users(store_id);
