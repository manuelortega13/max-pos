package com.maxpos.sale.dto;

import com.maxpos.sale.DiscountType;
import com.maxpos.sale.PaymentMethod;
import com.maxpos.sale.Sale;
import com.maxpos.sale.SaleStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record SaleDto(
        UUID id,
        String reference,
        Instant date,
        UUID cashierId,
        String cashierName,
        BigDecimal subtotal,
        BigDecimal tax,
        BigDecimal total,
        PaymentMethod paymentMethod,
        SaleStatus status,
        String refundReason,
        DiscountType discountType,
        BigDecimal discountValue,
        BigDecimal discountAmount,
        List<SaleItemDto> items
) {
    public static SaleDto from(Sale s) {
        return new SaleDto(
                s.getId(),
                s.getReference(),
                s.getDate(),
                s.getCashier().getId(),
                s.getCashierName(),
                s.getSubtotal(),
                s.getTax(),
                s.getTotal(),
                s.getPaymentMethod(),
                s.getStatus(),
                s.getRefundReason(),
                s.getDiscountType(),
                s.getDiscountValue(),
                s.getDiscountAmount(),
                s.getItems().stream().map(SaleItemDto::from).toList()
        );
    }
}
