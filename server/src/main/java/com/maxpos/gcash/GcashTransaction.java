package com.maxpos.gcash;

import com.maxpos.businessday.BusinessDay;
import com.maxpos.user.User;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One GCash service transaction (cash-in or cash-out). Captures
 * both amounts at the row level — fee is whatever the cashier
 * charged at the time. If the amount matched an active tier the
 * cashier UI locks the fee field; otherwise the cashier enters
 * the fee manually.
 *
 * Soft-void mirrors the CreditorPayment pattern: admin sets
 * {@link #voidedAt} + {@link #voidedBy}, the business-day
 * aggregation excludes voided rows, and history still shows them
 * for audit.
 */
@Entity
@Table(name = "gcash_transactions")
public class GcashTransaction {

    @Id
    @GeneratedValue
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private GcashTransactionType type;

    /** Workflow state. Service.create sets this based on type; admin
     *  flips PENDING → COMPLETED via the work queue. One-way. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private GcashTransactionStatus status = GcashTransactionStatus.PENDING;

    @Column(name = "completed_at")
    private Instant completedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "completed_by")
    private User completedBy;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal fee;

    /** Optional. Free-text — first + last name. */
    @Column(name = "customer_name")
    private String customerName;

    /** Phone. Required for {@link GcashTransactionType#CASH_IN}
     *  (the cashier needs the destination GCash number); not set
     *  for cash-out. DB-level CHECK constraint enforces this. */
    @Column(name = "customer_phone")
    private String customerPhone;

    /** Inbound GCash transaction reference. Required for
     *  {@link GcashTransactionType#CASH_OUT} — the cashier copies
     *  the last 6 chars (or more) of the "Ref no." shown on the
     *  store's GCash app — and must be NULL for cash-in. */
    @Column(name = "inbound_ref")
    private String inboundRef;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "cashier_id", nullable = false)
    private User cashier;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "business_day_id")
    private BusinessDay businessDay;

    @Column(nullable = false)
    private Instant date;

    @Column(nullable = false, unique = true, length = 64)
    private String reference;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(name = "voided_at")
    private Instant voidedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "voided_by")
    private User voidedBy;

    @PrePersist
    void onCreate() {
        if (date == null) date = Instant.now();
    }

    public UUID getId() { return id; }
    public GcashTransactionType getType() { return type; }
    public void setType(GcashTransactionType type) { this.type = type; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public BigDecimal getFee() { return fee; }
    public void setFee(BigDecimal fee) { this.fee = fee; }
    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }
    public String getCustomerPhone() { return customerPhone; }
    public void setCustomerPhone(String customerPhone) { this.customerPhone = customerPhone; }
    public String getInboundRef() { return inboundRef; }
    public void setInboundRef(String inboundRef) { this.inboundRef = inboundRef; }
    public User getCashier() { return cashier; }
    public void setCashier(User cashier) { this.cashier = cashier; }
    public BusinessDay getBusinessDay() { return businessDay; }
    public void setBusinessDay(BusinessDay businessDay) { this.businessDay = businessDay; }
    public Instant getDate() { return date; }
    public void setDate(Instant date) { this.date = date; }
    public String getReference() { return reference; }
    public void setReference(String reference) { this.reference = reference; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public Instant getVoidedAt() { return voidedAt; }
    public void setVoidedAt(Instant voidedAt) { this.voidedAt = voidedAt; }
    public User getVoidedBy() { return voidedBy; }
    public void setVoidedBy(User voidedBy) { this.voidedBy = voidedBy; }
    public GcashTransactionStatus getStatus() { return status; }
    public void setStatus(GcashTransactionStatus status) { this.status = status; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
    public User getCompletedBy() { return completedBy; }
    public void setCompletedBy(User completedBy) { this.completedBy = completedBy; }
}
