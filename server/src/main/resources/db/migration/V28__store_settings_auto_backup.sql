-- Daily automatic backup toggle. When enabled, the backend's scheduled job
-- writes a database backup to disk once a day, and the admin web app also
-- downloads one to the browser once a day. Off by default.
ALTER TABLE store_settings ADD COLUMN auto_backup_enabled BOOLEAN NOT NULL DEFAULT FALSE;
