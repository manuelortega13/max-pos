package com.maxpos.tenant;

import java.util.UUID;

/**
 * Holds the store (tenant) for the current thread / request. Hibernate's
 * {@link StoreTenantIdentifierResolver} reads this to scope every query and
 * stamp inserts.
 *
 * <p>Fail-closed by design: if no store and no root mode is set, queries
 * resolve to the {@link #NONE} sentinel, which matches no store and returns
 * nothing — a forgotten {@code setStore} can't leak another store's data.
 * Cross-tenant work (login bootstrap, the backup scheduler, platform admin)
 * must opt in explicitly via {@link #runAsRoot}, which {@code isRoot()}
 * recognises to bypass tenant filtering.
 */
public final class TenantContext {

    /** Bypasses tenant filtering (sees all stores). isRoot() recognises it. */
    public static final UUID ROOT = new UUID(0L, 0L); // 0000…0000

    /** Matches no store → fail-closed default when nothing is set. */
    public static final UUID NONE =
            UUID.fromString("ffffffff-ffff-ffff-ffff-ffffffffffff");

    private static final ThreadLocal<UUID> CURRENT = new ThreadLocal<>();
    private static final ThreadLocal<Boolean> ROOT_MODE = new ThreadLocal<>();

    private TenantContext() {}

    /** Scope subsequent work to one store. */
    public static void setStore(UUID storeId) {
        CURRENT.set(storeId);
        ROOT_MODE.remove();
    }

    /** Run subsequent work across all stores (login/scheduler/platform). */
    public static void runAsRoot() {
        ROOT_MODE.set(Boolean.TRUE);
        CURRENT.remove();
    }

    /** The current store id, or null when unset / root. */
    public static UUID currentStore() {
        return CURRENT.get();
    }

    public static boolean isRootMode() {
        return Boolean.TRUE.equals(ROOT_MODE.get());
    }

    /** Clear at the end of a request/unit of work to avoid thread-pool leakage. */
    public static void clear() {
        CURRENT.remove();
        ROOT_MODE.remove();
    }

    /** The identifier Hibernate's resolver hands to the ORM. */
    public static UUID resolve() {
        if (isRootMode()) return ROOT;
        UUID store = CURRENT.get();
        return store != null ? store : NONE;
    }
}
