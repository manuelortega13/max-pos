package com.maxpos.sale.dto;

import com.maxpos.sale.DiscountType;
import com.maxpos.sale.SaleItem;

import java.math.BigDecimal;
import java.util.UUID;

public record SaleItemDto(
        UUID productId,
        String productName,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal unitCost,
        BigDecimal subtotal,
        DiscountType discountType,
        BigDecimal discountValue,
        BigDecimal discountAmount
) {
    public static SaleItemDto from(SaleItem item) {
        return new SaleItemDto(
                item.getProduct().getId(),
                item.getProductName(),
                item.getQuantity(),
                item.getUnitPrice(),
                item.getUnitCost(),
                item.getSubtotal(),
                item.getDiscountType(),
                item.getDiscountValue(),
                item.getDiscountAmount()
        );
    }
}
