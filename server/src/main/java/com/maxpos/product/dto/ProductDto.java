package com.maxpos.product.dto;

import com.maxpos.product.Product;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record ProductDto(
        UUID id,
        String name,
        String sku,
        String barcode,
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
                p.getBarcode(),
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
