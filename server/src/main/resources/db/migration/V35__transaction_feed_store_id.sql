-- ─────────────────────────────────────────────────────────────────────────
-- Multi-store — Phase 3: add store_id to the transaction_feed view.
--
-- The view (V31) backs the admin Sales feed via the TransactionFeedRow
-- entity. SQL views bypass Hibernate's @TenantId filtering, so to keep the
-- feed tenant-scoped we surface store_id from each UNION branch and map it
-- with @TenantId on the entity. Each underlying table (sales, gcash, load)
-- carries store_id as of V33.
--
-- DROP + CREATE (not CREATE OR REPLACE) so column order is unconstrained;
-- the view has no dependents.
-- ─────────────────────────────────────────────────────────────────────────

DROP VIEW transaction_feed;

CREATE VIEW transaction_feed AS
SELECT
    s.id,
    s.store_id,
    'SALE'::varchar                 AS kind,
    'SALE'::varchar                 AS source,
    s.reference,
    s.date,
    s.cashier_id,
    s.cashier_name,
    (SELECT count(*) FROM sale_items si WHERE si.sale_id = s.id)::int AS items_count,
    s.payment_method                AS payment_label,
    s.total                         AS principal,
    NULL::numeric(12, 2)            AS fee,
    s.status                        AS status
FROM sales s
UNION ALL
SELECT
    g.id,
    g.store_id,
    (CASE WHEN g.type = 'CASH_IN' THEN 'GCASH_IN' ELSE 'GCASH_OUT' END)::varchar AS kind,
    'GCASH'::varchar                AS source,
    g.reference,
    g.date,
    g.cashier_id,
    u.name                          AS cashier_name,
    NULL::int                       AS items_count,
    'CASH'::varchar                 AS payment_label,
    g.amount                        AS principal,
    g.fee                           AS fee,
    (CASE
        WHEN g.voided_at IS NOT NULL   THEN 'VOIDED'
        WHEN g.status = 'COMPLETED'    THEN 'COMPLETED'
        ELSE 'PENDING'
    END)::varchar                   AS status
FROM gcash_transactions g
JOIN users u ON u.id = g.cashier_id
UNION ALL
SELECT
    l.id,
    l.store_id,
    'LOAD'::varchar                 AS kind,
    'LOAD'::varchar                 AS source,
    l.reference,
    l.date,
    l.cashier_id,
    u.name                          AS cashier_name,
    NULL::int                       AS items_count,
    'CASH'::varchar                 AS payment_label,
    l.amount                        AS principal,
    l.fee                           AS fee,
    (CASE
        WHEN l.voided_at IS NOT NULL   THEN 'VOIDED'
        WHEN l.status = 'COMPLETED'    THEN 'COMPLETED'
        ELSE 'PENDING'
    END)::varchar                   AS status
FROM load_transactions l
JOIN users u ON u.id = l.cashier_id;
