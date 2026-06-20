package com.maxpos.platform;

import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.platform.dto.ImpersonationResponse;
import com.maxpos.platform.dto.StoreSummaryDto;
import com.maxpos.platform.dto.StoreUpdateRequest;
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
    private final JwtService jwtService;
    private final JdbcTemplate jdbc;

    public PlatformStoreService(StoreRepository stores, JwtService jwtService, JdbcTemplate jdbc) {
        this.stores = stores;
        this.jwtService = jwtService;
        this.jdbc = jdbc;
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
                   (SELECT max(date) FROM sales sa WHERE sa.store_id = s.id) AS last_sale
            FROM stores s
            """;

    /** All stores with stats, newest activity first by created date. */
    public List<StoreSummaryDto> listStores() {
        return jdbc.query(STATS_SQL + " ORDER BY s.created_at", (rs, n) -> mapRow(rs));
    }

    /** One store with stats. */
    public StoreSummaryDto getStore(UUID id) {
        List<StoreSummaryDto> rows =
                jdbc.query(STATS_SQL + " WHERE s.id = ?", (rs, n) -> mapRow(rs), id);
        if (rows.isEmpty()) throw new NotFoundException("Store not found");
        return rows.get(0);
    }

    @Transactional
    public StoreSummaryDto setStatus(UUID id, StoreStatus status) {
        Store store = stores.findById(id)
                .orElseThrow(() -> new NotFoundException("Store not found"));
        store.setStatus(status);
        // Flush so the JdbcTemplate read-back in getStore (raw SQL, same
        // transaction) sees the change rather than the pre-update row.
        stores.saveAndFlush(store);
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
        return new ImpersonationResponse(token, store.getId(), store.getName(), admin.email());
    }

    private static StoreSummaryDto mapRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        Timestamp lastSale = rs.getTimestamp("last_sale");
        return new StoreSummaryDto(
                rs.getObject("id", UUID.class),
                rs.getString("name"),
                rs.getString("slug"),
                rs.getString("status"),
                toInstant(rs.getTimestamp("created_at")),
                rs.getLong("users"),
                rs.getLong("products"),
                rs.getLong("sales"),
                rs.getBigDecimal("revenue") == null ? BigDecimal.ZERO : rs.getBigDecimal("revenue"),
                lastSale == null ? null : lastSale.toInstant());
    }

    private static Instant toInstant(Timestamp ts) {
        return ts == null ? null : ts.toInstant();
    }
}
