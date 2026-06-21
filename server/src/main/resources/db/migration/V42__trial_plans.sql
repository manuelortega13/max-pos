-- ─────────────────────────────────────────────────────────────────────────
-- Multi-store — trial plans.
--
-- A plan with trial_days > 0 is a free trial of that length. After sign-up a
-- store owner picks a plan; choosing a trial stamps stores.trial_ends_at =
-- now + trial_days. A scheduled job suspends stores whose trial lapses without
-- moving to a paid plan (choosing a paid plan clears trial_ends_at).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE plans
    ADD COLUMN trial_days INTEGER NOT NULL DEFAULT 0;

-- When the store's current trial ends. NULL = not on a trial (no plan chosen
-- yet, or subscribed to a paid plan).
ALTER TABLE stores
    ADD COLUMN trial_ends_at TIMESTAMPTZ;

-- A trial plan owners can pick at sign-up. sort_order -1 so it lists first.
INSERT INTO plans (code, name, price_cents, max_users, max_products, sort_order, trial_days)
VALUES ('trial', '7-Day Trial', 0, 3, 100, -1, 7);
