-- Frontend-driven: enables the cashier POS offline queue. Mutually
-- requires allow_negative_stock=true because queued sales may replay
-- against zero or negative stock once the network returns; see
-- SettingsService.update() for the paired-constraint enforcement.
ALTER TABLE store_settings
    ADD COLUMN offline_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE;
