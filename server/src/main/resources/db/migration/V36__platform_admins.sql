-- ─────────────────────────────────────────────────────────────────────────
-- Multi-store — Phase 4: platform administrators.
--
-- Platform admins sit ABOVE all stores (manage the whole platform: list
-- stores, suspend/activate, view stats, impersonate). They are a SEPARATE
-- identity from store users — deliberately NOT in the `users` table and
-- with NO store_id / @TenantId — so a platform admin can never be tenant-
-- scoped or mistaken for a store's user, and the store tenancy guarantee
-- stays intact.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE platform_admins (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(255) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Seed one platform owner. Password is "admin123" (same verified bcrypt as
-- the seed store admin) — CHANGE THIS IN PRODUCTION.
INSERT INTO platform_admins (name, email, password_hash) VALUES
    ('Platform Owner', 'platform@maxpos.com',
     '$2y$10$LOry/hKopTo0DTWHQE7QBOHUEeHuCV0NZW5gM9uTRywthBG.Ssc6S');
