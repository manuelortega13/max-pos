-- Flip the inventory defaults to ON: stores allow negative stock and run
-- offline mode by default. Offline mode requires allow_negative_stock
-- (queued sales may replay against zero/negative stock once the network
-- returns — see SettingsService.update()), so the two are enabled together
-- and the paired invariant always holds.
ALTER TABLE store_settings ALTER COLUMN allow_negative_stock SET DEFAULT TRUE;
ALTER TABLE store_settings ALTER COLUMN offline_mode_enabled SET DEFAULT TRUE;

-- Bring existing stores onto the new default.
UPDATE store_settings
   SET allow_negative_stock = TRUE,
       offline_mode_enabled = TRUE;
