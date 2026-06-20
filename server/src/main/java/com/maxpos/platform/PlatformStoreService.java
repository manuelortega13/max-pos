package com.maxpos.platform;

import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.platform.dto.StoreSummaryDto;
import com.maxpos.platform.dto.StoreUpdateRequest;
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
    private final JdbcTemplate jdbc;

    public PlatformStoreService(StoreRepository stores, JdbcTemplate jdbc) {
        this.stores = stores;
        this.jdbc = jdbc;
    }

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
