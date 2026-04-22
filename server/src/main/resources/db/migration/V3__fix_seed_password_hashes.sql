-- The bcrypt hash originally seeded in V2 did NOT actually hash to "admin123",
-- so every login attempt with the seed credentials returned 401.
-- Replace with a verified bcrypt($2y$10$) hash of "admin123".
--
-- V2 is left untouched on purpose: Flyway tracks migration checksums, and
-- mutating an already-applied migration would break existing installs.

UPDATE users
   SET password_hash = '$2y$10$LOry/hKopTo0DTWHQE7QBOHUEeHuCV0NZW5gM9uTRywthBG.Ssc6S'
 WHERE email IN (
   'admin@maxpos.com',
   'sarah.chen@maxpos.com',
   'carlos.rivera@maxpos.com'
 );
