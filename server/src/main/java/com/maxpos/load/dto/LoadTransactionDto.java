package com.maxpos.load.dto;

import com.maxpos.load.LoadTransaction;
import com.maxpos.load.LoadTransactionStatus;
import com.maxpos.sale.PaymentMethod;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record LoadTransactionDto(
        UUID id,
        LoadTransactionStatus status,
        BigDecimal amount,
        BigDecimal fee,
        String promo,
        String customerPhone,
        PaymentMethod paymentMethod,
        UUID creditorId,
        String creditorName,
        UUID cashierId,
        String cashierName,
        UUID businessDayId,
        Instant date,
        String reference,
        String notes,
        Instant completedAt,
        UUID completedById,
        String completedByName,
        Instant voidedAt,
        UUID voidedById,
        String voidedByName
) {
    public static LoadTransactionDto from(LoadTransaction t) {
        return new LoadTransactionDto(
                t.getId(),
                t.getStatus(),
                t.getAmount(),
                t.getFee(),
                t.getPromo(),
                t.getCustomerPhone(),
                t.getPaymentMethod(),
                t.getCreditor() != null ? t.getCreditor().getId() : null,
                t.getCreditor() != null ? t.getCreditor().getFullName() : null,
                t.getCashier() != null ? t.getCashier().getId() : null,
                t.getCashier() != null ? t.getCashier().getName() : null,
                t.getBusinessDay() != null ? t.getBusinessDay().getId() : null,
                t.getDate(),
                t.getReference(),
                t.getNotes(),
                t.getCompletedAt(),
                t.getCompletedBy() != null ? t.getCompletedBy().getId() : null,
                t.getCompletedBy() != null ? t.getCompletedBy().getName() : null,
                t.getVoidedAt(),
                t.getVoidedBy() != null ? t.getVoidedBy().getId() : null,
                t.getVoidedBy() != null ? t.getVoidedBy().getName() : null
        );
    }
}
