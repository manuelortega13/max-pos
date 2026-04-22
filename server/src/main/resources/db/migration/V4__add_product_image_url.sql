-- Image storage: base64 data URL of a client-side-resized JPEG (~400px max).
-- Kept as TEXT so callers can store either a data URL (data:image/jpeg;base64,...)
-- or a regular URL if we ever move to external storage.

ALTER TABLE products ADD COLUMN image_url TEXT;
