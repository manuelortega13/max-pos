-- ─────────────────────────────────────────────────────────────────────────
-- Multi-store — platform audit log.
--
-- Append-only record of platform-level actions (store suspend/activate/edit,
-- impersonation, admin creation, store registration, platform logins) for
-- the console's Activity page. Platform-level (non-tenant) table.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE platform_audit_log (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- Platform admin who performed it; null for unauthenticated actions
    -- (e.g. public store registration).
    actor_email     VARCHAR(255),
    -- Machine code, e.g. STORE_SUSPENDED, STORE_EDITED, ADMIN_CREATED.
    action          VARCHAR(64)  NOT NULL,
    -- Optional store the action targeted.
    target_store_id UUID,
    -- Human label for the target (store name, admin email) at action time.
    target_label    VARCHAR(255),
    -- Optional freeform detail.
    detail          TEXT
);

CREATE INDEX idx_platform_audit_at ON platform_audit_log (at DESC);
