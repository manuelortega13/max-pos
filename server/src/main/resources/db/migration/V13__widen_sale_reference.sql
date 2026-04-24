-- Offline-queue clientRefs are `S-<uuid>` (38 chars) which overflowed the
-- original VARCHAR(32) reference column. Widen to 64 so both the
-- backend-generated `S-YYYYMMDD-NNNNN` form (~16 chars) and the client
-- UUID form fit with headroom.
ALTER TABLE sales
    ALTER COLUMN reference TYPE VARCHAR(64);
