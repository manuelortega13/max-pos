-- ─────────────────────────────────────────────────────────────────────────
-- Multi-store — per-plan currency.
--
-- Each plan is now priced in its own currency, chosen when the plan is created
-- and fixed thereafter. The store-facing choose-a-plan page converts each
-- plan's price from the plan's currency into the store's currency (instead of
-- assuming the platform-settings currency). Existing plans are backfilled with
-- the platform's configured currency, preserving their current meaning.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE plans ADD COLUMN currency        VARCHAR(8) NOT NULL DEFAULT 'USD';
ALTER TABLE plans ADD COLUMN currency_symbol VARCHAR(8) NOT NULL DEFAULT '$';

UPDATE plans p
   SET currency        = ps.default_currency,
       currency_symbol = ps.default_currency_symbol
  FROM platform_settings ps;
