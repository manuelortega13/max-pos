package com.maxpos.product.dto;

import com.maxpos.product.ProductBatch;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * Flattened view of an expiring batch with enough product info for the
 * notification bell UI to render without a second fetch.
 */
public record ExpiringBatchDto(
        UUID batchId,
        UUID productId,
        String productName,
        String productImage,
        String productImageUrl,
        int quantityRemaining,
        LocalDate expiryDate,
        long daysUntilExpiry
) {
    public static ExpiringBatchDto from(ProductBatch b) {
        long days = ChronoUnit.DAYS.between(LocalDate.now(), b.getExpiryDate());
        return new ExpiringBatchDto(
                b.getId(),
                b.getProduct().getId(),
                b.getProduct().getName(),
                b.getProduct().getImage(),
                b.getProduct().getImageUrl(),
                b.getQuantityRemaining(),
                b.getExpiryDate(),
                days
        );
    }
}
