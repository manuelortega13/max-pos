-- ─────────────────────────────────────────────────────────────────────────
-- Multi-store — subscription plans.
--
-- Platform-level (non-tenant) catalog of plans, plus an optional plan
-- assignment per store. Limits (max_users / max_products) are NULL when
-- unlimited. The console displays each store's usage against these limits;
-- hard enforcement at store-create time is a deliberate follow-up so existing
-- store-creation paths stay untouched for now.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE plans (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    code         VARCHAR(32)  NOT NULL UNIQUE,
    name         VARCHAR(80)  NOT NULL,
    -- Monthly price in minor units (cents); 0 for a free tier.
    price_cents  INTEGER      NOT NULL DEFAULT 0,
    -- NULL means unlimited.
    max_users    INTEGER,
    max_products INTEGER,
    sort_order   INTEGER      NOT NULL DEFAULT 0,
    active       BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Optional plan per store. ON DELETE SET NULL so removing a plan never
-- orphans/blocks a store row.
ALTER TABLE stores
    ADD COLUMN plan_id UUID REFERENCES plans (id) ON DELETE SET NULL;

INSERT INTO plans (code, name, price_cents, max_users, max_products, sort_order) VALUES
    ('free',    'Free',     0,    2,    50,   0),
    ('starter', 'Starter',  2900, 5,    500,  1),
    ('pro',     'Pro',      9900, NULL, NULL, 2);

-- Put the existing demo store on the Pro plan so the console shows a plan
-- and usage out of the box. Other/new stores start unassigned.
UPDATE stores
   SET plan_id = (SELECT id FROM plans WHERE code = 'pro')
 WHERE id = '00000000-0000-0000-0000-000000000001';
