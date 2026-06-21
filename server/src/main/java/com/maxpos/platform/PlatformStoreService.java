package com.maxpos.platform;

import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.platform.dto.ImpersonationResponse;
import com.maxpos.platform.dto.StoreSummaryDto;
import com.maxpos.platform.dto.StoreUpdateRequest;
import com.maxpos.platform.dto.StoreUserDto;
import com.maxpos.platform.fx.FxSnapshot;
import com.maxpos.security.JwtService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Store management for the platform console. Reads/writes the (non-tenant)
 * stores table directly, and computes cross-store stats via an explicit
 * native query (JdbcTemplate, typed column reads — bypasses @TenantId by
 * design, since the platform legitimately sees every store).
 */
@Service
@Transactional(readOnly = true)
public class PlatformStoreService {

    private final StoreRepository stores;
    private final com.maxpos.platform.plan.PlanRepository plans;
    private final JwtService jwtService;
    private final JdbcTemplate jdbc;
    private final com.maxpos.platform.audit.PlatformAuditService audit;
    private final com.maxpos.platform.fx.FxRateService fxService;
    private final PlatformSettingsService platformSettings;

    public PlatformStoreService(StoreRepository stores, com.maxpos.platform.plan.PlanRepository plans,
                                JwtService jwtService, JdbcTemplate jdbc,
                                com.maxpos.platform.audit.PlatformAuditService audit,
                                com.maxpos.platform.fx.FxRateService fxService,
                                PlatformSettingsService platformSettings) {
        this.stores = stores;
        this.plans = plans;
        this.jwtService = jwtService;
        this.jdbc = jdbc;
        this.audit = audit;
        this.fxService = fxService;
        this.platformSettings = platformSettings;
    }

    /** One store admin's fields, read via JdbcTemplate for impersonation. */
    private record AdminRow(UUID id, String email, String name, String role, UUID storeId) {}

    private static final String STATS_SQL = """
            SELECT s.id, s.name, s.slug, s.status, s.created_at,
                   (SELECT count(*) FROM users u   WHERE u.store_id  = s.id) AS users,
                   (SELECT count(*) FROM products p WHERE p.store_id = s.id) AS products,
                   (SELECT count(*) FROM sales sa  WHERE sa.store_id = s.id
                                                     AND sa.status = 'COMPLETED') AS sales,
                   (SELECT COALESCE(sum(total), 0) FROM sales sa WHERE sa.store_id = s.id
                                                     AND sa.status = 'COMPLETED') AS revenue,
                   (SELECT max(date) FROM sales sa WHERE sa.store_id = s.id) AS last_sale,
                   ss.currency        AS currency,
                   ss.currency_symbol AS currency_symbol,
                   s.trial_ends_at    AS trial_ends_at,
                   pl.id   AS plan_id,
                   pl.name AS plan_name,
                   pl.max_users    AS max_users,
                   pl.max_products AS max_products
            FROM stores s
            LEFT JOIN plans pl ON pl.id = s.plan_id
            LEFT JOIN store_settings ss ON ss.store_id = s.id
            """;

    /** All stores with stats, newest activity first by created date. */
    public List<StoreSummaryDto> listStores() {
        FxSnapshot fx = currentFx();
        return jdbc.query(STATS_SQL + " ORDER BY s.created_at", (rs, n) -> mapRow(rs, fx));
    }

    /** One store with stats. */
    public StoreSummaryDto getStore(UUID id) {
        FxSnapshot fx = currentFx();
        List<StoreSummaryDto> rows =
                jdbc.query(STATS_SQL + " WHERE s.id = ?", (rs, n) -> mapRow(rs, fx), id);
        if (rows.isEmpty()) throw new NotFoundException("Store not found");
        return rows.get(0);
    }

    /** FX snapshot for the platform currency, used to convert store revenue. */
    private FxSnapshot currentFx() {
        return fxService.snapshot(platformSettings.get().defaultCurrency());
    }

    /**
     * The store's users. Read via JdbcTemplate with an explicit store_id —
     * @TenantId would otherwise scope this to the (untenanted) request context.
     */
    public List<StoreUserDto> listUsers(UUID storeId) {
        if (!stores.existsById(storeId)) throw new NotFoundException("Store not found");
        return jdbc.query("""
                SELECT id, name, email, role, active, created_at
                FROM users
                WHERE store_id = ?
                ORDER BY system_account DESC, created_at ASC
                """,
                (rs, n) -> new StoreUserDto(
                        rs.getObject("id", UUID.class),
                        rs.getString("name"),
                        rs.getString("email"),
                        rs.getString("role"),
                        rs.getBoolean("active"),
                        toInstant(rs.getTimestamp("created_at"))),
                storeId);
    }

    @Transactional
    public StoreSummaryDto setStatus(UUID id, StoreStatus status) {
        Store store = stores.findById(id)
                .orElseThrow(() -> new NotFoundException("Store not found"));
        store.setStatus(status);
        // Flush so the JdbcTemplate read-back in getStore (raw SQL, same
        // transaction) sees the change rather than the pre-update row.
        stores.saveAndFlush(store);
        audit.record(status == StoreStatus.ACTIVE ? "STORE_ACTIVATED" : "STORE_SUSPENDED",
                store.getId(), store.getName(), null);
        return getStore(id);
    }

    @Transactional
    public StoreSummaryDto assignPlan(UUID id, UUID planId) {
        Store store = stores.findById(id)
                .orElseThrow(() -> new NotFoundException("Store not found"));
        String planLabel;
        if (planId == null) {
            store.setPlanId(null);
            planLabel = "no plan";
        } else {
            com.maxpos.platform.plan.Plan plan = plans.findById(planId)
                    .orElseThrow(() -> new NotFoundException("Plan not found"));
            store.setPlanId(plan.getId());
            planLabel = plan.getName();
        }
        // Flush so the JdbcTemplate read-back in getStore reflects the change.
        stores.saveAndFlush(store);
        audit.record("STORE_PLAN_CHANGED", store.getId(), store.getName(), "plan: " + planLabel);
        return getStore(id);
    }

    @Transactional
    public StoreSummaryDto update(UUID id, StoreUpdateRequest req) {
        Store store = stores.findById(id)
                .orElseThrow(() -> new NotFoundException("Store not found"));
        String slug = req.slug().trim().toLowerCase();
        stores.findBySlugIgnoreCase(slug)
                .filter(other -> !other.getId().equals(id))
                .ifPresent(other -> { throw new ConflictException("Another store already uses that slug."); });
        store.setName(req.name().trim());
        store.setSlug(slug);
        // Flush so the JdbcTemplate read-back in getStore reflects the edit.
        stores.saveAndFlush(store);
        audit.record("STORE_EDITED", store.getId(), store.getName(), "name/slug updated");
        return getStore(id);
    }

    /**
     * Mint a store token so the platform admin can act inside a store. It's
     * a normal store token issued for that store's admin user, so it reuses
     * the entire tenancy path with no special-casing. Blocked for suspended
     * stores (the token wouldn't work anyway — sessions are cut off there).
     */
    public ImpersonationResponse impersonate(UUID storeId) {
        Store store = stores.findById(storeId)
                .orElseThrow(() -> new NotFoundException("Store not found"));
        if (store.getStatus() != StoreStatus.ACTIVE) {
            throw new ConflictException("Cannot impersonate a suspended store; activate it first.");
        }
        // Resolve that store's admin with an explicit typed query and mint the
        // token from the raw fields. We deliberately do NOT load the User via
        // JPA here: this service is @Transactional, so its Hibernate session is
        // bound to the (NONE) tenant at method entry and a JPA load wouldn't see
        // the row. JdbcTemplate bypasses @TenantId. Prefer the system account,
        // then the oldest admin.
        List<AdminRow> rows = jdbc.query(
                """
                SELECT id, email, name, role, store_id FROM users
                WHERE store_id = ? AND role = 'ADMIN' AND active = true
                ORDER BY system_account DESC, created_at ASC
                LIMIT 1
                """,
                (rs, n) -> new AdminRow(
                        rs.getObject("id", UUID.class),
                        rs.getString("email"),
                        rs.getString("name"),
                        rs.getString("role"),
                        rs.getObject("store_id", UUID.class)),
                storeId);
        if (rows.isEmpty()) {
            throw new ConflictException("Store has no active admin to impersonate.");
        }
        AdminRow admin = rows.get(0);
        String token = jwtService.issueStoreToken(
                admin.id(), admin.email(), admin.name(), admin.role(), admin.storeId());
        audit.record("STORE_IMPERSONATED", store.getId(), store.getName(),
                "as " + admin.email());
        return new ImpersonationResponse(token, store.getId(), store.getName(), admin.email());
    }

    private static StoreSummaryDto mapRow(java.sql.ResultSet rs, FxSnapshot fx)
            throws java.sql.SQLException {
        Timestamp lastSale = rs.getTimestamp("last_sale");
        BigDecimal revenue = rs.getBigDecimal("revenue") == null
                ? BigDecimal.ZERO : rs.getBigDecimal("revenue");
        String currency = rs.getString("currency");
        // Convert into the platform currency for the cross-store total. Falls
        // back to the raw amount when the currency is unknown to the rates.
        BigDecimal multiplier = fx.multiplierFor(currency);
        BigDecimal revenueConverted = multiplier == null ? revenue : revenue.multiply(multiplier);
        return new StoreSummaryDto(
                rs.getObject("id", UUID.class),
                rs.getString("name"),
                rs.getString("slug"),
                rs.getString("status"),
                toInstant(rs.getTimestamp("created_at")),
                rs.getLong("users"),
                rs.getLong("products"),
                rs.getLong("sales"),
                revenue,
                currency,
                rs.getString("currency_symbol"),
                revenueConverted,
                lastSale == null ? null : lastSale.toInstant(),
                rs.getObject("plan_id", UUID.class),
                rs.getString("plan_name"),
                (Integer) rs.getObject("max_users"),
                (Integer) rs.getObject("max_products"),
                toInstant(rs.getTimestamp("trial_ends_at")));
    }

    private static Instant toInstant(Timestamp ts) {
        return ts == null ? null : ts.toInstant();
    }
}
