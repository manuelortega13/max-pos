package com.maxpos.product.dto;

import com.maxpos.product.ProductBatch;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record ProductBatchDto(
        UUID id,
        UUID productId,
        int quantityReceived,
        int quantityRemaining,
        LocalDate expiryDate,
        Instant receivedAt,
        BigDecimal costPerUnit,
        String note,
        Instant writtenOffAt
) {
    public static ProductBatchDto from(ProductBatch b) {
        return new ProductBatchDto(
                b.getId(),
                b.getProduct().getId(),
                b.getQuantityReceived(),
                b.getQuantityRemaining(),
                b.getExpiryDate(),
                b.getReceivedAt(),
                b.getCostPerUnit(),
                b.getNote(),
                b.getWrittenOffAt()
        );
    }
}
