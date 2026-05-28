package com.maxpos.businessday;

import com.maxpos.user.User;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Mid-day top-up of the opening cash float. Recorded as discrete
 * rows so the End-of-Day reconciliation can show every addition
 * separately. Soft-void via {@link #voidedAt} + {@link #voidedBy}
 * follows the same audit pattern as creditor payments and gcash
 * transactions.
 */
@Entity
@Table(name = "business_day_float_additions")
public class FloatAddition {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "business_day_id", nullable = false)
    private BusinessDay businessDay;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(columnDefinition = "text")
    private String note;

    @Column(name = "added_at", nullable = false)
    private Instant addedAt;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "added_by", nullable = false)
    private User addedBy;

    @Column(name = "voided_at")
    private Instant voidedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "voided_by")
    private User voidedBy;

    @PrePersist
    void onCreate() {
        if (addedAt == null) addedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public BusinessDay getBusinessDay() { return businessDay; }
    public void setBusinessDay(BusinessDay businessDay) { this.businessDay = businessDay; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public Instant getAddedAt() { return addedAt; }
    public void setAddedAt(Instant addedAt) { this.addedAt = addedAt; }
    public User getAddedBy() { return addedBy; }
    public void setAddedBy(User addedBy) { this.addedBy = addedBy; }
    public Instant getVoidedAt() { return voidedAt; }
    public void setVoidedAt(Instant voidedAt) { this.voidedAt = voidedAt; }
    public User getVoidedBy() { return voidedBy; }
    public void setVoidedBy(User voidedBy) { this.voidedBy = voidedBy; }
}
