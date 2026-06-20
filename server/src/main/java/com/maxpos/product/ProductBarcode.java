package com.maxpos.product;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/**
 * One scan code that resolves to a product. A product can have many —
 * different EAN-13s per supplier, an inner-pack code vs an outer-
 * carton code, etc. Codes are globally UNIQUE so a scanner read
 * unambiguously identifies the product.
 */
@Entity
@Table(name = "product_barcodes")
public class ProductBarcode {

    @Id
    @GeneratedValue
    private UUID id;
    /** Owning store. Hibernate discriminator multi-tenancy (@TenantId):
     *  auto-filtered on reads, auto-stamped on insert from TenantContext. */
    @TenantId
    @Column(name = "store_id", nullable = false, updatable = false)
    private UUID storeId;


    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(nullable = false, unique = true, length = 64)
    private String code;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public Product getProduct() { return product; }
    public void setProduct(Product product) { this.product = product; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public Instant getCreatedAt() { return createdAt; }
}
