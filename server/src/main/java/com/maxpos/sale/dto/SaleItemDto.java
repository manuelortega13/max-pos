package com.maxpos.sale.dto;

import com.maxpos.sale.SaleItem;

import java.math.BigDecimal;
import java.util.UUID;

public record SaleItemDto(
        UUID productId,
        String productName,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal subtotal
) {
    public static SaleItemDto from(SaleItem item) {
        return new SaleItemDto(
                item.getProduct().getId(),
                item.getProductName(),
                item.getQuantity(),
                item.getUnitPrice(),
                item.getSubtotal()
        );
    }
}
