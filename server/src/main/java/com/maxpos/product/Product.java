package com.maxpos.product;

import com.maxpos.category.Category;
import jakarta.persistence.*;
import org.hibernate.annotations.Formula;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "products")
public class Product {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true, length = 64)
    private String sku;

    /**
     * Scan codes that resolve to this product. Many-to-one from the
     * codes' side; here they're loaded eagerly because the codes are
     * tiny (length 64 each, typically 1–3 per product) and every
     * place that reads a product to render it also wants the codes.
     */
    @OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    private List<ProductBarcode> barcodes = new ArrayList<>();

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal price;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal cost;

    /**
     * Salable stock, computed as the sum of quantity_remaining across batches
     * that are not written off and not past expiry. Read-only from the entity's
     * perspective: physical stock changes happen through batch inserts (restock)
     * or batch decrements (sale/write-off), not by mutating this field.
     */
    @Formula("""
        COALESCE((
            SELECT SUM(b.quantity_remaining)
              FROM product_batches b
             WHERE b.product_id = id
               AND b.written_off_at IS NULL
               AND (b.expiry_date IS NULL OR b.expiry_date >= current_date)
        ), 0)
        """)
    private int stock;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;

    @Column(length = 16)
    private String image;

    @Column(name = "image_url", columnDefinition = "text")
    private String imageUrl;

    @Column(columnDefinition = "text")
    private String description;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public UUID getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }
    public List<ProductBarcode> getBarcodes() { return barcodes; }
    /** Convenience adder that wires the back-reference. */
    public void addBarcode(String code) {
        ProductBarcode b = new ProductBarcode();
        b.setProduct(this);
        b.setCode(code);
        barcodes.add(b);
    }
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }
    public BigDecimal getCost() { return cost; }
    public void setCost(BigDecimal cost) { this.cost = cost; }
    /** Computed from batches. No setter — do not try to mutate directly. */
    public int getStock() { return stock; }
    public Category getCategory() { return category; }
    public void setCategory(Category category) { this.category = category; }
    public String getImage() { return image; }
    public void setImage(String image) { this.image = image; }
    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public Instant getCreatedAt() { return createdAt; }
}
