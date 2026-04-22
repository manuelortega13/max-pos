package com.maxpos.product;

import com.maxpos.category.Category;
import com.maxpos.category.CategoryRepository;
import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.product.dto.ExpiringBatchDto;
import com.maxpos.product.dto.ProductBatchDto;
import com.maxpos.product.dto.ProductDto;
import com.maxpos.product.dto.ProductUpsertRequest;
import com.maxpos.product.dto.RestockRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    public ProductService(ProductRepository products,
                          ProductBatchRepository batches,
                          CategoryRepository categories) {
        this.products = products;
        this.batches = batches;
        this.categories = categories;
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

        return ProductDto.from(products.findById(saved.getId()).orElseThrow());
    }

    @Transactional
    public ProductDto update(UUID id, ProductUpsertRequest req) {
        Product p = products.findById(id)
                .orElseThrow(() -> new NotFoundException("Product not found"));
        Category category = categories.findById(req.categoryId())
                .orElseThrow(() -> new NotFoundException("Category not found"));
        apply(p, req, category);
        return ProductDto.from(p);
    }

    @Transactional
    public void delete(UUID id) {
        if (!products.existsById(id)) throw new NotFoundException("Product not found");
        products.deleteById(id);
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

        return ProductDto.from(products.findById(id).orElseThrow());
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
        return ProductBatchDto.from(b);
    }

    @Transactional
    public void deductStockFefo(UUID productId, int quantity) {
        if (quantity <= 0) return;
        List<ProductBatch> salable = batches.findSalableByProductFefo(productId);

        int remaining = quantity;
        for (ProductBatch b : salable) {
            if (remaining <= 0) break;
            int take = Math.min(b.getQuantityRemaining(), remaining);
            b.setQuantityRemaining(b.getQuantityRemaining() - take);
            remaining -= take;
        }
        if (remaining > 0) {
            throw new ConflictException("Insufficient stock for product " + productId);
        }
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
