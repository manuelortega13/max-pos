-- Move barcodes off the products table into a side table so one
-- product can carry many codes. Common in retail when the same SKU
-- comes from multiple suppliers with different EAN-13s, or when the
-- inner pack and the outer carton each carry their own scan code.
--
-- The old `products.barcode` column held at most one code (UNIQUE,
-- nullable). We migrate every non-null value into the new table
-- preserving the (product_id, code) link, then drop the column.

CREATE TABLE product_barcodes (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    code        VARCHAR(64)  NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_barcodes_product ON product_barcodes (product_id);

-- Migrate existing single-barcode rows into the new table. Skip
-- nulls and blanks; trim defensively so any stray whitespace from
-- legacy imports doesn't sneak through the UNIQUE check.
INSERT INTO product_barcodes (product_id, code)
SELECT id, TRIM(barcode)
FROM products
WHERE barcode IS NOT NULL AND TRIM(barcode) <> '';

ALTER TABLE products DROP COLUMN barcode;
