package com.maxpos.platform.plan;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A subscription plan. Platform-level (non-tenant) catalog row. {@code null}
 * limits mean unlimited.
 */
@Entity
@Table(name = "plans")
public class Plan {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false, unique = true, length = 32)
    private String code;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(name = "price_cents", nullable = false)
    private int priceCents;

    /** The plan's pricing currency — set at creation, never changed. */
    @Column(nullable = false, length = 8)
    private String currency;

    @Column(name = "currency_symbol", nullable = false, length = 8)
    private String currencySymbol;

    @Column(name = "max_users")
    private Integer maxUsers;

    @Column(name = "max_products")
    private Integer maxProducts;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    /** Free-trial length in days; 0 means this is not a trial plan. */
    @Column(name = "trial_days", nullable = false)
    private int trialDays;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public int getPriceCents() { return priceCents; }
    public void setPriceCents(int priceCents) { this.priceCents = priceCents; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getCurrencySymbol() { return currencySymbol; }
    public void setCurrencySymbol(String currencySymbol) { this.currencySymbol = currencySymbol; }
    public Integer getMaxUsers() { return maxUsers; }
    public void setMaxUsers(Integer maxUsers) { this.maxUsers = maxUsers; }
    public Integer getMaxProducts() { return maxProducts; }
    public void setMaxProducts(Integer maxProducts) { this.maxProducts = maxProducts; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public int getTrialDays() { return trialDays; }
    public void setTrialDays(int trialDays) { this.trialDays = trialDays; }
    public boolean isTrial() { return trialDays > 0; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public Instant getCreatedAt() { return createdAt; }
}
