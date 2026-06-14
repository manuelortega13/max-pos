-- Mark the built-in system administrator so it can't be deleted, demoted, or
-- deactivated (which would risk locking everyone out of admin). The flag lives
-- on the row — not tied to the email — so renaming the account keeps it
-- protected, and it round-trips through database backup/restore.
ALTER TABLE users ADD COLUMN system_account BOOLEAN NOT NULL DEFAULT FALSE;

-- Flag the seeded admin (from V2). Matches by its seed email; a standard
-- install has exactly this account.
UPDATE users SET system_account = TRUE WHERE email = 'admin@maxpos.com';
