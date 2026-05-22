-- Business day / End-of-Day tracking.
--
-- A "business day" is a single global open-close cycle: an admin opens
-- the day (with an opening cash float), cashiers ring up sales against
-- it, an admin closes the day (counted cash → variance). Snapshot
-- totals are written at close time so historical Z-reports stay
-- accurate even if sales are later refunded or edited.
CREATE TABLE business_days (
    id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    opened_at       TIMESTAMPTZ    NOT NULL,
    opened_by       UUID           NOT NULL REFERENCES users(id),
    opening_float   NUMERIC(12, 2) NOT NULL CHECK (opening_float >= 0),

    -- Close fields — NULL while the day is open.
    closed_at       TIMESTAMPTZ,
    closed_by       UUID           REFERENCES users(id),
    counted_cash    NUMERIC(12, 2) CHECK (counted_cash IS NULL OR counted_cash >= 0),
    notes           TEXT,

    -- Snapshots written at close time (NULL while open). These are
    -- frozen copies of the day's totals so the Z-report stays stable
    -- even if rows in `sales` are refunded or adjusted afterwards.
    expected_cash   NUMERIC(12, 2),
    variance        NUMERIC(12, 2),
    total_sales     NUMERIC(12, 2),
    total_refunds   NUMERIC(12, 2),
    cash_sales      NUMERIC(12, 2),
    cash_refunds    NUMERIC(12, 2),
    card_sales      NUMERIC(12, 2),
    transfer_sales  NUMERIC(12, 2),
    sales_count     INTEGER,
    items_sold      INTEGER,

    -- Close fields are all-or-nothing: either the day is open (all NULL)
    -- or fully closed (closed_at + closed_by + counted_cash all set).
    CONSTRAINT business_days_close_consistent CHECK (
        (closed_at IS NULL AND closed_by IS NULL AND counted_cash IS NULL)
        OR
        (closed_at IS NOT NULL AND closed_by IS NOT NULL AND counted_cash IS NOT NULL)
    )
);

-- At most one business day may be open at a time. Partial unique index
-- on closed_at IS NULL — Postgres treats each NULL as distinct in a
-- normal unique index, so this is the canonical way to enforce
-- "at most one open row".
CREATE UNIQUE INDEX uniq_business_days_open
    ON business_days ((closed_at IS NULL))
    WHERE closed_at IS NULL;

CREATE INDEX idx_business_days_opened_at ON business_days (opened_at DESC);

-- Link each sale to the day it was rung up under. Nullable for two
-- reasons: (1) sales authored before this feature shipped have no day,
-- (2) sales queued offline before any day opens may still sync
-- successfully and arrive with no current open day.
ALTER TABLE sales
    ADD COLUMN business_day_id UUID REFERENCES business_days(id) ON DELETE SET NULL;

CREATE INDEX idx_sales_business_day ON sales (business_day_id);
