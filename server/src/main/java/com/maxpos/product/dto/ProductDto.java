package com.maxpos.product.dto;

import com.maxpos.product.Product;

import java.math.BigDecimal;
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
        String description,
        boolean active
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
                p.getDescription(),
                p.isActive()
        );
    }
}
