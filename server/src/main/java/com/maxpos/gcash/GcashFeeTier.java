package com.maxpos.gcash;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One slice of the admin's fee schedule. A tier matches a
 * transaction when {@code min_amount <= amount < max_amount} (the
 * range is left-inclusive, right-exclusive so contiguous tiers
 * don't double-match the boundary value). Inactive tiers are
 * ignored by the lookup but kept in history.
 */
@Entity
@Table(name = "gcash_fee_tiers")
public class GcashFeeTier {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "min_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal minAmount;

    @Column(name = "max_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal maxAmount;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal fee;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public BigDecimal getMinAmount() { return minAmount; }
    public void setMinAmount(BigDecimal minAmount) { this.minAmount = minAmount; }
    public BigDecimal getMaxAmount() { return maxAmount; }
    public void setMaxAmount(BigDecimal maxAmount) { this.maxAmount = maxAmount; }
    public BigDecimal getFee() { return fee; }
    public void setFee(BigDecimal fee) { this.fee = fee; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public Instant getCreatedAt() { return createdAt; }
}
