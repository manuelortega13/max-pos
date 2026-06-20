package com.maxpos.tenant;

import org.hibernate.context.spi.CurrentTenantIdentifierResolver;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Feeds Hibernate's discriminator multi-tenancy ({@code @TenantId}) from
 * {@link TenantContext}. {@code isRoot} bypasses tenant filtering for the
 * {@link TenantContext#ROOT} sentinel (login bootstrap, backup, platform).
 */
@Component
public class StoreTenantIdentifierResolver implements CurrentTenantIdentifierResolver<UUID> {

    @Override
    public UUID resolveCurrentTenantIdentifier() {
        return TenantContext.resolve();
    }

    @Override
    public boolean validateExistingCurrentSessions() {
        // The tenant changes per request; don't require it to be stable for a
        // reused Session.
        return false;
    }

    @Override
    public boolean isRoot(UUID tenantId) {
        return TenantContext.ROOT.equals(tenantId);
    }
}
