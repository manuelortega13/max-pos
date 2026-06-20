package com.maxpos.platform;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * Singleton platform configuration owned by the super admin. Non-tenant
 * entity (no {@code @TenantId}); exactly one row exists.
 */
@Entity
@Table(name = "platform_settings")
public class PlatformSetting {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "default_currency", nullable = false, length = 8)
    private String defaultCurrency;

    @Column(name = "default_currency_symbol", nullable = false, length = 8)
    private String defaultCurrencySymbol;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PreUpdate
    @PrePersist
    void touch() {
        updatedAt = Instant.now();
    }

    public Integer getId() { return id; }
    public String getDefaultCurrency() { return defaultCurrency; }
    public void setDefaultCurrency(String defaultCurrency) { this.defaultCurrency = defaultCurrency; }
    public String getDefaultCurrencySymbol() { return defaultCurrencySymbol; }
    public void setDefaultCurrencySymbol(String s) { this.defaultCurrencySymbol = s; }
    public Instant getUpdatedAt() { return updatedAt; }
}
