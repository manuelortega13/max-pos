-- ─────────────────────────────────────────────────────────────────────────
-- Multi-store (multi-tenant) — Phase 1 of N: the stores table.
--
-- The system was built single-store. This introduces the tenant table and
-- registers the EXISTING production store as the default, so every existing
-- row can be attributed to it (in V33) without moving or losing any data.
--
-- The default store's id is FIXED (not random) so V33 can use it as the
-- column default: while the app is being made tenant-aware over the next
-- phases, any legacy INSERT that doesn't set store_id still lands on the
-- existing store rather than orphaning data. The default is dropped in a
-- later phase once the app sets store_id explicitly.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE stores (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    -- URL-safe identifier for the store (e.g. for future per-store links /
    -- onboarding). Unique across the platform.
    slug        VARCHAR(64)  NOT NULL UNIQUE,
    status      VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Register the existing store. Its display name is taken from the current
-- store_settings row so we don't invent one; falls back to 'My Store' only
-- if settings are somehow absent.
INSERT INTO stores (id, name, slug)
SELECT '00000000-0000-0000-0000-000000000001',
       COALESCE((SELECT store_name FROM store_settings WHERE id = 1), 'My Store'),
       'default';
