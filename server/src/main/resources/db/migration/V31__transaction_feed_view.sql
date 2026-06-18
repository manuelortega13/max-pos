-- Unified, read-only feed of every store transaction — product sales,
-- GCash cash-in/out, and cellphone load — normalized into one row shape.
--
-- Backs the admin Sales page, which previously fetched all three tables
-- in full and merged/sorted/paged them client-side. As volume grew that
-- payload (and the in-browser merge) made the page slow to load. This
-- view lets the backend do the union once and serve a single sorted,
-- filtered, *paginated* slice via /api/transactions.
--
-- Columns are the least-common-denominator the table renders:
--   kind          row discriminator (SALE | GCASH_IN | GCASH_OUT | LOAD)
--   source        coarse type filter bucket (SALE | GCASH | LOAD)
--   items_count   line count for sales; NULL for service rows
--   payment_label sale payment method; 'CASH' for service rows
--   principal     cash that changed hands (excludes the service fee)
--   fee           service-fee revenue (NULL for sales)
--   status        COMPLETED | PENDING | REFUNDED | VOIDED (normalized)
--
-- Sale cashier_name is denormalized on the row; GCash/Load join users
-- for it, mirroring how their DTOs resolve the name today.
CREATE VIEW transaction_feed AS
SELECT
    s.id,
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
