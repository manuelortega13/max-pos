-- MaxPOS initial schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           VARCHAR(255) NOT NULL,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    role           VARCHAR(16)  NOT NULL CHECK (role IN ('ADMIN', 'CASHIER')),
    active         BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE categories (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(255) NOT NULL UNIQUE,
    description  TEXT,
    color        VARCHAR(16)  NOT NULL,
    icon         VARCHAR(64)  NOT NULL
);

CREATE TABLE products (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(255)   NOT NULL,
    sku          VARCHAR(64)    NOT NULL UNIQUE,
    barcode      VARCHAR(64)    NOT NULL UNIQUE,
    price        NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    cost         NUMERIC(12, 2) NOT NULL CHECK (cost  >= 0),
    stock        INTEGER        NOT NULL DEFAULT 0 CHECK (stock >= 0),
    category_id  UUID           NOT NULL REFERENCES categories(id),
    image        VARCHAR(16),
    description  TEXT,
    active       BOOLEAN        NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_products_category ON products (category_id);
CREATE INDEX idx_products_active   ON products (active) WHERE active;

CREATE TABLE sales (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference       VARCHAR(32)    NOT NULL UNIQUE,
    date            TIMESTAMPTZ    NOT NULL,
    cashier_id      UUID           NOT NULL REFERENCES users(id),
    cashier_name    VARCHAR(255)   NOT NULL,
    subtotal        NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    tax             NUMERIC(12, 2) NOT NULL CHECK (tax      >= 0),
    total           NUMERIC(12, 2) NOT NULL CHECK (total    >= 0),
    payment_method  VARCHAR(16)    NOT NULL CHECK (payment_method IN ('CASH', 'CARD', 'TRANSFER')),
    status          VARCHAR(16)    NOT NULL CHECK (status         IN ('COMPLETED', 'REFUNDED', 'PENDING'))
);
CREATE INDEX idx_sales_cashier ON sales (cashier_id);
CREATE INDEX idx_sales_date    ON sales (date DESC);

CREATE TABLE sale_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id        UUID           NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id     UUID           NOT NULL REFERENCES products(id),
    product_name   VARCHAR(255)   NOT NULL,
    quantity       INTEGER        NOT NULL CHECK (quantity > 0),
    unit_price     NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    subtotal       NUMERIC(12, 2) NOT NULL CHECK (subtotal   >= 0)
);
CREATE INDEX idx_sale_items_sale    ON sale_items (sale_id);
CREATE INDEX idx_sale_items_product ON sale_items (product_id);

CREATE TABLE store_settings (
    id               INTEGER PRIMARY KEY CHECK (id = 1),
    store_name       VARCHAR(255)   NOT NULL,
    currency         VARCHAR(8)     NOT NULL,
    currency_symbol  VARCHAR(4)     NOT NULL,
    tax_rate         NUMERIC(5, 4)  NOT NULL CHECK (tax_rate >= 0 AND tax_rate <= 1),
    receipt_footer   TEXT,
    address          VARCHAR(255),
    phone            VARCHAR(64)
);
