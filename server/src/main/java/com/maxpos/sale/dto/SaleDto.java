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
        /** Set only when paymentMethod = CREDIT, null otherwise. */
        UUID creditorId,
        /** Creditor's name at sale time. Snapshotted via the entity
         *  relationship — if the creditor is later renamed, the
         *  rendered name updates too. Acceptable for now. */
        String creditorName,
        /** FK to the business day this sale was rung up under. Null
         *  for pre-V16 historical rows. The EoD live preview uses
         *  this to mirror the backend's findAllByBusinessDayId close
         *  logic exactly — filtering by timestamp left a gap when an
         *  offline sale was synced after the day opened with its
         *  original (earlier) date stamp. */
        UUID businessDayId,
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
                s.getCreditor() != null ? s.getCreditor().getId() : null,
                s.getCreditor() != null ? s.getCreditor().getFullName() : null,
                s.getBusinessDay() != null ? s.getBusinessDay().getId() : null,
                s.getItems().stream().map(SaleItemDto::from).toList()
        );
    }
}
