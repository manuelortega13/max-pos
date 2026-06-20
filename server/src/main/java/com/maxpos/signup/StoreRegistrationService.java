package com.maxpos.signup;

import com.maxpos.auth.dto.AuthResponse;
import com.maxpos.common.ConflictException;
import com.maxpos.platform.PlatformSettingsService;
import com.maxpos.platform.audit.PlatformAuditService;
import com.maxpos.platform.dto.PlatformSettingsDto;
import com.maxpos.security.JwtService;
import com.maxpos.signup.dto.RegistrationDefaults;
import com.maxpos.signup.dto.StoreRegistrationRequest;
import com.maxpos.user.UserRole;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Public store registration: atomically creates a store, its first admin
 * user, and a settings row, then returns a login token so onboarding flows
 * straight into the new store's admin.
 *
 * Writes go through JdbcTemplate with an explicit store_id rather than JPA:
 * this is a @Transactional method, so a Hibernate session would bind the
 * (untenanted) request context at entry and @TenantId inserts couldn't be
 * steered to the brand-new store. JdbcTemplate bypasses @TenantId and keeps
 * all three inserts in one transaction (atomic). DB unique constraints on
 * stores.slug and users.email are the backstop against races.
 */
@Service
public class StoreRegistrationService {

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final PlatformAuditService audit;
    private final PlatformSettingsService platformSettings;

    public StoreRegistrationService(JdbcTemplate jdbc, PasswordEncoder passwordEncoder,
                                    JwtService jwtService, PlatformAuditService audit,
                                    PlatformSettingsService platformSettings) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.audit = audit;
        this.platformSettings = platformSettings;
    }

    /** The platform default currency the sign-up form should pre-select. */
    public RegistrationDefaults defaults() {
        PlatformSettingsDto s = platformSettings.get();
        return new RegistrationDefaults(s.defaultCurrency(), s.defaultCurrencySymbol());
    }

    @Transactional
    public AuthResponse register(StoreRegistrationRequest req) {
        String slug = req.slug().trim().toLowerCase();
        String email = req.adminEmail().trim().toLowerCase();
        String storeName = req.storeName().trim();
        String adminName = req.adminName().trim();
        // Fall back to the platform default currency when the form omits it.
        PlatformSettingsDto defaults = platformSettings.get();
        String currency = blankDefault(req.currency(), defaults.defaultCurrency());
        String symbol = blankDefault(req.currencySymbol(), defaults.defaultCurrencySymbol());

        Integer slugTaken = jdbc.queryForObject(
                "SELECT count(*) FROM stores WHERE lower(slug) = ?", Integer.class, slug);
        if (slugTaken != null && slugTaken > 0) {
            throw new ConflictException("That store URL is already taken.");
        }
        Integer emailTaken = jdbc.queryForObject(
                "SELECT count(*) FROM users WHERE lower(email) = ?", Integer.class, email);
        if (emailTaken != null && emailTaken > 0) {
            throw new ConflictException("That email is already registered.");
        }

        UUID storeId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        String hash = passwordEncoder.encode(req.adminPassword());

        jdbc.update("INSERT INTO stores (id, name, slug, status) VALUES (?, ?, ?, 'ACTIVE')",
                storeId, storeName, slug);
        jdbc.update("""
                INSERT INTO users (id, store_id, name, email, password_hash, role,
                                   active, system_account, created_at)
                VALUES (?, ?, ?, ?, ?, 'ADMIN', true, false, now())
                """, userId, storeId, adminName, email, hash);
        jdbc.update("""
                INSERT INTO store_settings (store_id, store_name, currency, currency_symbol, tax_rate)
                VALUES (?, ?, ?, ?, 0)
                """, storeId, storeName, currency, symbol);

        audit.record("STORE_REGISTERED", storeId, storeName, "self-service signup by " + email);

        String token = jwtService.issueStoreToken(userId, email, adminName, "ADMIN", storeId);
        return new AuthResponse(token,
                new AuthResponse.UserInfo(userId, adminName, email, UserRole.ADMIN));
    }

    private static String blankDefault(String value, String fallback) {
        return (value == null || value.isBlank()) ? fallback : value.trim();
    }
}
