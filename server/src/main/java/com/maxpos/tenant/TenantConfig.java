package com.maxpos.tenant;

import org.hibernate.cfg.AvailableSettings;
import org.springframework.boot.hibernate.autoconfigure.HibernatePropertiesCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Registers {@link StoreTenantIdentifierResolver} with Hibernate so
 * {@code @TenantId} discriminator multi-tenancy is active. Done explicitly
 * (rather than relying on bean auto-detection) so the wiring is unambiguous.
 */
@Configuration
public class TenantConfig {

    @Bean
    HibernatePropertiesCustomizer tenantResolverCustomizer(StoreTenantIdentifierResolver resolver) {
        return props -> props.put(AvailableSettings.MULTI_TENANT_IDENTIFIER_RESOLVER, resolver);
    }
}
