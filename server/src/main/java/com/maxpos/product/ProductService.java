package com.maxpos.product;

import com.maxpos.category.Category;
import com.maxpos.category.CategoryRepository;
import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.product.dto.ProductDto;
import com.maxpos.product.dto.ProductUpsertRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class ProductService {

    private final ProductRepository products;
    private final CategoryRepository categories;

    public ProductService(ProductRepository products, CategoryRepository categories) {
        this.products = products;
        this.categories = categories;
    }

    public List<ProductDto> list(Optional<UUID> categoryId, Optional<Boolean> activeOnly) {
        List<Product> rows = categoryId
                .map(products::findAllByCategoryId)
                .orElseGet(() -> activeOnly.filter(Boolean::booleanValue).isPresent()
                        ? products.findAllByActiveTrue()
                        : products.findAll());
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
        if (products.existsByBarcode(req.barcode())) {
            throw new ConflictException("Barcode already exists");
        }
        Category category = categories.findById(req.categoryId())
                .orElseThrow(() -> new NotFoundException("Category not found"));

        Product p = new Product();
        apply(p, req, category);
        return ProductDto.from(products.save(p));
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

    private void apply(Product p, ProductUpsertRequest req, Category category) {
        p.setName(req.name());
        p.setSku(req.sku());
        p.setBarcode(req.barcode());
        p.setPrice(req.price());
        p.setCost(req.cost());
        p.setStock(req.stock());
        p.setCategory(category);
        p.setImage(req.image());
        p.setDescription(req.description());
        p.setActive(req.active());
    }
}
