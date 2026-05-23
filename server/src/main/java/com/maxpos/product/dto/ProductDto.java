package com.maxpos.product.dto;

import com.maxpos.product.Product;
import com.maxpos.product.ProductBarcode;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ProductDto(
        UUID id,
        String name,
        String sku,
        /**
         * Scan codes attached to this product. Zero or more — most
         * have one, some have several (multi-supplier SKUs, inner-
         * vs outer-pack codes, etc.). The first entry is treated as
         * the "primary" for display purposes but they're all valid
         * scan targets.
         */
        List<String> barcodes,
        BigDecimal price,
        BigDecimal cost,
        int stock,
        UUID categoryId,
        String image,
        String imageUrl,
        String description,
        boolean active,
        Instant createdAt
) {
    public static ProductDto from(Product p) {
        return new ProductDto(
                p.getId(),
                p.getName(),
                p.getSku(),
                p.getBarcodes().stream().map(ProductBarcode::getCode).toList(),
                p.getPrice(),
                p.getCost(),
                p.getStock(),
                p.getCategory().getId(),
                p.getImage(),
                p.getImageUrl(),
                p.getDescription(),
                p.isActive(),
                p.getCreatedAt()
        );
    }
}
