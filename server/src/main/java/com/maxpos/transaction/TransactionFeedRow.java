package com.maxpos.transaction;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.TenantId;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Read-only projection over the {@code transaction_feed} SQL view
 * (see V31). One row per store transaction — sale, GCash, or load —
 * normalized to a common shape so the admin Sales page can page over
 * the union server-side instead of merging three full lists in the
 * browser.
 *
 * {@link Immutable} because the view is non-updatable; this entity is
 * only ever read. Hibernate's {@code ddl-auto=validate} treats the
 * view like a table for column validation, which is all we need.
 */
@Entity
@Immutable
@Table(name = "transaction_feed")
public class TransactionFeedRow {

    @Id
    private UUID id;

    /** Owning store — scopes the feed via Hibernate @TenantId (the view
     *  surfaces store_id from each underlying table; see V35). Read-only. */
    @TenantId
    @Column(name = "store_id", updatable = false, insertable = false)
    private UUID storeId;

    /** SALE | GCASH_IN | GCASH_OUT | LOAD. */
    private String kind;

    /** Coarse filter bucket: SALE | GCASH | LOAD. */
    private String source;

    private String reference;

    private Instant date;

    @Column(name = "cashier_id")
    private UUID cashierId;

    @Column(name = "cashier_name")
    private String cashierName;

    /** Line count for sales; null for service rows. */
    @Column(name = "items_count")
    private Integer itemsCount;

    @Column(name = "payment_label")
    private String paymentLabel;

    /** Cash that changed hands, excluding any service fee. */
    private BigDecimal principal;

    /** Service-fee revenue for GCash/Load; null for sales. */
    private BigDecimal fee;

    /** COMPLETED | PENDING | REFUNDED | VOIDED (normalized in the view). */
    private String status;

    protected TransactionFeedRow() {
    }

    public UUID getId() {
        return id;
    }

    public String getKind() {
        return kind;
    }

    public String getSource() {
        return source;
    }

    public String getReference() {
        return reference;
    }

    public Instant getDate() {
        return date;
    }

    public UUID getCashierId() {
        return cashierId;
    }

    public String getCashierName() {
        return cashierName;
    }

    public Integer getItemsCount() {
        return itemsCount;
    }

    public String getPaymentLabel() {
        return paymentLabel;
    }

    public BigDecimal getPrincipal() {
        return principal;
    }

    public BigDecimal getFee() {
        return fee;
    }

    public String getStatus() {
        return status;
    }
}
