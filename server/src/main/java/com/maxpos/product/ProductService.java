package com.maxpos.product;

import com.maxpos.category.Category;
import com.maxpos.category.CategoryRepository;
import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.notification.NotificationPublisher;
import com.maxpos.product.dto.ExpiringBatchDto;
import com.maxpos.product.dto.ProductBatchDto;
import com.maxpos.product.dto.ProductDto;
import com.maxpos.product.dto.ProductUpsertRequest;
import com.maxpos.product.dto.RestockRequest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class ProductService {

    private static final Sort NEWEST_FIRST = Sort.by(
            Sort.Order.desc("createdAt"),
            Sort.Order.asc("name")
    );

    private final ProductRepository products;
    private final ProductBatchRepository batches;
    private final CategoryRepository categories;
    private final NotificationPublisher notifications;

    @PersistenceContext
    private EntityManager em;

    public ProductService(ProductRepository products,
                          ProductBatchRepository batches,
                          CategoryRepository categories,
                          NotificationPublisher notifications) {
        this.products = products;
        this.batches = batches;
        this.categories = categories;
        this.notifications = notifications;
    }

    /**
     * Flush pending writes and re-read the product from the DB so its
     * @Formula-backed `stock` reflects batches we just inserted/updated.
     * Without this, Hibernate returns the cached entity from L1 with the
     * stale computed value.
     */
    private Product refreshed(Product p) {
        em.flush();
        em.refresh(p);
        return p;
    }

    public List<ProductDto> list(Optional<UUID> categoryId, Optional<Boolean> activeOnly) {
        List<Product> rows = categoryId
                .map(id -> products.findAllByCategoryId(id, NEWEST_FIRST))
                .orElseGet(() -> activeOnly.filter(Boolean::booleanValue).isPresent()
                        ? products.findAllByActiveTrue(NEWEST_FIRST)
                        : products.findAll(NEWEST_FIRST));
        return rows.stream().map(ProductDto::from).toList();
    }

    public ProductDto get(UUID id) {
        return products.findById(id).map(ProductDto::from)
                .orElseThrow(() -> new NotFoundException("Product not found"));
    }

    public ProductDto findByBarcode(String barcode) {
        return products.findByBarcode(barcode).map(ProductDto::from)
                .orElseThrow(() -> new NotFoundException("No product with that barcode"));
    }

    @Transactional
    public ProductDto create(ProductUpsertRequest req) {
        if (products.existsBySkuIgnoreCase(req.sku())) {
            throw new ConflictException("SKU already exists");
        }
        if (req.barcode() != null && !req.barcode().isBlank()
                && products.existsByBarcode(req.barcode())) {
            throw new ConflictException("Barcode already exists");
        }
        Category category = categories.findById(req.categoryId())
                .orElseThrow(() -> new NotFoundException("Category not found"));

        Product p = new Product();
        apply(p, req, category);
        Product saved = products.save(p);

        if (req.stock() > 0) {
            ProductBatch opening = new ProductBatch();
            opening.setProduct(saved);
            opening.setQuantityReceived(req.stock());
            opening.setQuantityRemaining(req.stock());
            opening.setNote("Opening balance");
            batches.save(opening);
        }

        ProductDto result = ProductDto.from(refreshed(saved));
        notifications.publishInventoryChanged();
        return result;
    }

    @Transactional
    public ProductDto update(UUID id, ProductUpsertRequest req) {
        Product p = products.findById(id)
                .orElseThrow(() -> new NotFoundException("Product not found"));
        Category category = categories.findById(req.categoryId())
                .orElseThrow(() -> new NotFoundException("Category not found"));
        apply(p, req, category);
        notifications.publishInventoryChanged();
        return ProductDto.from(p);
    }

    @Transactional
    public void delete(UUID id) {
        if (!products.existsById(id)) throw new NotFoundException("Product not found");
        products.deleteById(id);
        notifications.publishInventoryChanged();
    }

    @Transactional
    public ProductDto restock(UUID id, RestockRequest req) {
        if (req.quantity() == null || req.quantity() <= 0) {
            throw new IllegalArgumentException("Restock quantity must be positive");
        }
        Product p = products.findById(id)
                .orElseThrow(() -> new NotFoundException("Product not found"));

        ProductBatch batch = new ProductBatch();
        batch.setProduct(p);
        batch.setQuantityReceived(req.quantity());
        batch.setQuantityRemaining(req.quantity());
        batch.setExpiryDate(req.expiryDate());
        batch.setCostPerUnit(req.costPerUnit());
        batch.setNote(req.note());
        batches.save(batch);

        // Option B: restock's optional cost overrides the product's stored
        // cost going forward (batch's cost_per_unit still holds history).
        // Selling price is re-scaled to preserve the existing markup ratio so
        // margins stay stable when supplier prices drift.
        if (req.costPerUnit() != null) {
            BigDecimal oldCost = p.getCost();
            BigDecimal oldPrice = p.getPrice();
            BigDecimal newCost = req.costPerUnit();

            p.setCost(newCost);

            if (oldCost.signum() > 0 && oldPrice.signum() > 0) {
                BigDecimal ratio = oldPrice.divide(oldCost, 6, RoundingMode.HALF_UP);
                BigDecimal newPrice = newCost.multiply(ratio).setScale(2, RoundingMode.HALF_UP);
                p.setPrice(newPrice);
            }
        }

        ProductDto result = ProductDto.from(refreshed(p));
        notifications.publishInventoryChanged();
        return result;
    }

    public List<ProductBatchDto> listBatches(UUID productId) {
        if (!products.existsById(productId)) {
            throw new NotFoundException("Product not found");
        }
        return batches.findAllByProductIdOrderByReceivedAtDesc(productId).stream()
                .map(ProductBatchDto::from)
                .toList();
    }

    public List<ExpiringBatchDto> listExpiring(int withinDays) {
        LocalDate cutoff = LocalDate.now().plusDays(Math.max(withinDays, 0));
        return batches.findExpiringBy(cutoff).stream()
                .map(ExpiringBatchDto::from)
                .toList();
    }

    @Transactional
    public ProductBatchDto writeOffBatch(UUID batchId) {
        ProductBatch b = batches.findById(batchId)
                .orElseThrow(() -> new NotFoundException("Batch not found"));
        if (b.getWrittenOffAt() != null) {
            throw new ConflictException("Batch already written off");
        }
        b.setWrittenOffAt(Instant.now());
        ProductBatchDto result = ProductBatchDto.from(b);
        notifications.publishInventoryChanged();
        return result;
    }

    /**
     * FEFO (first-expired-first-out) deduction. Walks salable batches from
     * earliest-expiring and takes from each until the order quantity is
     * satisfied. When {@code allowNegative} is on, any shortfall is applied
     * to the last touched batch (driving its quantity_remaining negative), or
     * — if the product has no batches at all — a new oversell batch is
     * created so the Product.stock @Formula reflects the negative count.
     */
    @Transactional
    public void deductStockFefo(Product product, int quantity, boolean allowNegative) {
        if (quantity <= 0) return;
        List<ProductBatch> salable = batches.findSalableByProductFefo(product.getId());

        int remaining = quantity;
        ProductBatch lastTouched = null;
        for (ProductBatch b : salable) {
            if (remaining <= 0) break;
            int take = Math.min(b.getQuantityRemaining(), remaining);
            b.setQuantityRemaining(b.getQuantityRemaining() - take);
            remaining -= take;
            lastTouched = b;
        }

        if (remaining > 0) {
            if (!allowNegative) {
                throw new ConflictException("Insufficient stock for product " + product.getId());
            }
            if (lastTouched != null) {
                // Drive the last touched batch negative.
                lastTouched.setQuantityRemaining(lastTouched.getQuantityRemaining() - remaining);
            } else {
                // Product has no salable batches at all — record the oversell
                // as its own batch so Product.stock @Formula sees it.
                ProductBatch oversell = new ProductBatch();
                oversell.setProduct(product);
                oversell.setQuantityReceived(remaining);
                oversell.setQuantityRemaining(-remaining);
                oversell.setNote("Oversold (allow-negative-stock enabled)");
                batches.save(oversell);
            }
        }
    }

    /**
     * @deprecated Use {@link #deductStockFefo(Product, int, boolean)} instead.
     * Kept for any external callers that still pass a raw product id; always
     * rejects the overshoot (no allow-negative behavior).
     */
    @Deprecated
    @Transactional
    public void deductStockFefo(UUID productId, int quantity) {
        Product p = products.findById(productId)
                .orElseThrow(() -> new NotFoundException("Product not found"));
        deductStockFefo(p, quantity, false);
    }

    private void apply(Product p, ProductUpsertRequest req, Category category) {
        p.setName(req.name());
        p.setSku(req.sku());
        p.setBarcode(req.barcode() == null || req.barcode().isBlank() ? null : req.barcode());
        p.setPrice(req.price());
        p.setCost(req.cost());
        p.setCategory(category);
        p.setImage(req.image());
        p.setImageUrl(req.imageUrl());
        p.setDescription(req.description());
        p.setActive(req.active());
    }
}
