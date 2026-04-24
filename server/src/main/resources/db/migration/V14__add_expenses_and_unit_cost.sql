-- Store unit cost at sale time so gross-profit math doesn't drift when
-- product.cost changes later. Nullable so historical rows (pre-V14)
-- aren't invalidated; the report UI falls back to product.cost for those.
ALTER TABLE sale_items
    ADD COLUMN unit_cost NUMERIC(12, 2);

-- Expenses tracked against a date — admin-managed, counted against
-- gross profit to compute net profit in the reports page.
CREATE TABLE expenses (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    date        DATE         NOT NULL,
    category    VARCHAR(64),
    description TEXT         NOT NULL,
    amount      NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by  UUID         REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_expenses_date ON expenses (date);
