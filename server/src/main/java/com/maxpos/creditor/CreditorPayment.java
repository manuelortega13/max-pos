package com.maxpos.creditor;

import com.maxpos.businessday.BusinessDay;
import com.maxpos.sale.PaymentMethod;
import com.maxpos.user.User;
import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A settlement against a creditor's outstanding balance.
 *
 * Voiding is soft — sets {@link #voidedAt} + {@link #voidedBy}. The
 * @Formula on Creditor.outstandingBalance excludes voided payments,
 * and BusinessDayService.close does the same when aggregating cash
 * credit payments for the Z-report.
 */
@Entity
@Table(name = "creditor_payments")
public class CreditorPayment {

    @Id
    @GeneratedValue
    private UUID id;
    /** Owning store. Hibernate discriminator multi-tenancy (@TenantId):
     *  auto-filtered on reads, auto-stamped on insert from TenantContext. */
    @TenantId
    @Column(name = "store_id", nullable = false, updatable = false)
    private UUID storeId;


    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "creditor_id", nullable = false)
    private Creditor creditor;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_method", nullable = false, length = 16)
    private PaymentMethod paymentMethod;

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
    public Creditor getCreditor() { return creditor; }
    public void setCreditor(Creditor creditor) { this.creditor = creditor; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public PaymentMethod getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(PaymentMethod paymentMethod) { this.paymentMethod = paymentMethod; }
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
