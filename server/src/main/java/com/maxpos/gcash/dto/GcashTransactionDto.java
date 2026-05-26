package com.maxpos.gcash.dto;

import com.maxpos.gcash.GcashTransaction;
import com.maxpos.gcash.GcashTransactionStatus;
import com.maxpos.gcash.GcashTransactionType;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record GcashTransactionDto(
        UUID id,
        GcashTransactionType type,
        GcashTransactionStatus status,
        BigDecimal amount,
        BigDecimal fee,
        String customerName,
        String customerPhone,
        String inboundRef,
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
    public static GcashTransactionDto from(GcashTransaction t) {
        return new GcashTransactionDto(
                t.getId(),
                t.getType(),
                t.getStatus(),
                t.getAmount(),
                t.getFee(),
                t.getCustomerName(),
                t.getCustomerPhone(),
                t.getInboundRef(),
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
