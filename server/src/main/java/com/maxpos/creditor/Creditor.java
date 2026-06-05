package com.maxpos.creditor;

import jakarta.persistence.*;
import org.hibernate.annotations.Formula;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A customer who buys on credit and pays later. Linked from sales
 * via sales.creditor_id when payment_method = 'CREDIT'.
 *
 * Settlement (recording payments against the outstanding balance)
 * isn't tracked yet — {@link #outstandingBalance} reflects pure
 * sell-side activity. When settlement lands, the @Formula below
 * will need to subtract the sum of payments too.
 */
@Entity
@Table(name = "creditors")
public class Creditor {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(nullable = false, length = 64)
    private String phone;

    @Column(columnDefinition = "text")
    private String address;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_term", nullable = false, length = 16)
    private PaymentTerm paymentTerm;

    /** NULL = no limit (cashier never sees the over-limit warning). */
    @Column(name = "credit_limit", precision = 12, scale = 2)
    private BigDecimal creditLimit;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /**
     * Live outstanding balance:
     *   sum(non-refunded credit-sale totals)
     *   + sum(non-voided credit-load amount+fee)
     *   − sum(non-voided payment amounts)
     *
     * Read-only from the entity's perspective — changes come from new
     * sales, credit loads, refunds, or recorded/voided payments. The
     * sales term skips the CREDIT check on payment_method because every
     * sale with a creditor_id IS a credit sale (enforced by the V18
     * check constraint); the load term keeps the explicit
     * payment_method filter as a guard alongside the V26 constraint.
     *
     * Credit loads count from the moment they're recorded (PENDING
     * included) — the customer owes the money the instant they take
     * the load on credit, just like a credit sale. A voided load drops
     * back out.
     */
    @Formula("""
        COALESCE((
            SELECT SUM(s.total)
              FROM sales s
             WHERE s.creditor_id = id
               AND s.status <> 'REFUNDED'
        ), 0)
        +
        COALESCE((
            SELECT SUM(l.amount + l.fee)
              FROM load_transactions l
             WHERE l.creditor_id = id
               AND l.payment_method = 'CREDIT'
               AND l.voided_at IS NULL
        ), 0)
        -
        COALESCE((
            SELECT SUM(p.amount)
              FROM creditor_payments p
             WHERE p.creditor_id = id
               AND p.voided_at IS NULL
        ), 0)
        """)
    private BigDecimal outstandingBalance;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public PaymentTerm getPaymentTerm() { return paymentTerm; }
    public void setPaymentTerm(PaymentTerm paymentTerm) { this.paymentTerm = paymentTerm; }
    public BigDecimal getCreditLimit() { return creditLimit; }
    public void setCreditLimit(BigDecimal creditLimit) { this.creditLimit = creditLimit; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public Instant getCreatedAt() { return createdAt; }
    public BigDecimal getOutstandingBalance() { return outstandingBalance; }
}
