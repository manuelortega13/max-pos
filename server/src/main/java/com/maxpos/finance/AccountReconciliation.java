package com.maxpos.finance;

import com.maxpos.user.User;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Count-and-confirm record for an {@link Account}. When the admin
 * counts physical cash (or checks a bank balance) and confirms,
 * the service writes one row here AND a paired
 * {@link AccountMovement} of source kind {@code RECONCILE} carrying
 * the variance — so the running balance stays uniform regardless
 * of whether the counted amount matched the expected.
 *
 * The pair link is {@link #adjustmentMovement}; null when variance
 * is exactly zero (no adjustment needed).
 */
@Entity
@Table(name = "account_reconciliations")
public class AccountReconciliation {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    @Column(name = "counted_at", nullable = false)
    private Instant countedAt;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "counted_by", nullable = false)
    private User countedBy;

    @Column(name = "expected_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal expectedAmount;

    @Column(name = "counted_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal countedAmount;

    /** Persisted = counted − expected. Positive = over, negative = short. */
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal variance;

    @Column(columnDefinition = "text")
    private String note;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "adjustment_movement_id")
    private AccountMovement adjustmentMovement;

    @Column(name = "voided_at")
    private Instant voidedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "voided_by")
    private User voidedBy;

    @PrePersist
    void onCreate() {
        if (countedAt == null) countedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public Account getAccount() { return account; }
    public void setAccount(Account account) { this.account = account; }
    public Instant getCountedAt() { return countedAt; }
    public void setCountedAt(Instant countedAt) { this.countedAt = countedAt; }
    public User getCountedBy() { return countedBy; }
    public void setCountedBy(User countedBy) { this.countedBy = countedBy; }
    public BigDecimal getExpectedAmount() { return expectedAmount; }
    public void setExpectedAmount(BigDecimal expectedAmount) { this.expectedAmount = expectedAmount; }
    public BigDecimal getCountedAmount() { return countedAmount; }
    public void setCountedAmount(BigDecimal countedAmount) { this.countedAmount = countedAmount; }
    public BigDecimal getVariance() { return variance; }
    public void setVariance(BigDecimal variance) { this.variance = variance; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public AccountMovement getAdjustmentMovement() { return adjustmentMovement; }
    public void setAdjustmentMovement(AccountMovement adjustmentMovement) { this.adjustmentMovement = adjustmentMovement; }
    public Instant getVoidedAt() { return voidedAt; }
    public void setVoidedAt(Instant voidedAt) { this.voidedAt = voidedAt; }
    public User getVoidedBy() { return voidedBy; }
    public void setVoidedBy(User voidedBy) { this.voidedBy = voidedBy; }
}
