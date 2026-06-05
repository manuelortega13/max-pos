package com.maxpos.load;

import com.maxpos.businessday.BusinessDay;
import com.maxpos.creditor.Creditor;
import com.maxpos.sale.PaymentMethod;
import com.maxpos.user.User;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One cellphone load transaction. Cash is collected at the till; the
 * row lands PENDING and the admin flips it to COMPLETED after
 * actually sending the load from their phone.
 *
 * Soft-void + status workflow follow the same pattern as GCash cash-in
 * transactions — keep history visible, exclude voided rows from the
 * Z-report aggregates.
 */
@Entity
@Table(name = "load_transactions")
public class LoadTransaction {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal fee;

    /** Optional. Free-text load promo — e.g. "Unli Calls 50",
     *  "GoSURF 99", or empty for plain credit. */
    @Column
    private String promo;

    /** Destination phone number. Required — without it the admin
     *  can't send the load. DB-level NOT NULL enforces. */
    @Column(name = "customer_phone", nullable = false)
    private String customerPhone;

    /** How the customer paid. CASH (cash at the till — the default and
     *  original behaviour) or CREDIT (charged to a creditor's tab).
     *  Constrained to those two by the V26 check constraint. */
    @Enumerated(EnumType.STRING)
    @Column(name = "payment_method", nullable = false, length = 16)
    private PaymentMethod paymentMethod = PaymentMethod.CASH;

    /** Set only when {@link #paymentMethod} = CREDIT — the creditor
     *  whose account this load is charged to. Null for cash loads
     *  (symmetry enforced by the V26 check constraint, mirroring
     *  sales.creditor_id). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "creditor_id")
    private Creditor creditor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private LoadTransactionStatus status = LoadTransactionStatus.PENDING;

    @Column(name = "completed_at")
    private Instant completedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "completed_by")
    private User completedBy;

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
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public BigDecimal getFee() { return fee; }
    public void setFee(BigDecimal fee) { this.fee = fee; }
    public String getPromo() { return promo; }
    public void setPromo(String promo) { this.promo = promo; }
    public String getCustomerPhone() { return customerPhone; }
    public void setCustomerPhone(String customerPhone) { this.customerPhone = customerPhone; }
    public PaymentMethod getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(PaymentMethod paymentMethod) { this.paymentMethod = paymentMethod; }
    public Creditor getCreditor() { return creditor; }
    public void setCreditor(Creditor creditor) { this.creditor = creditor; }
    public LoadTransactionStatus getStatus() { return status; }
    public void setStatus(LoadTransactionStatus status) { this.status = status; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
    public User getCompletedBy() { return completedBy; }
    public void setCompletedBy(User completedBy) { this.completedBy = completedBy; }
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
}
