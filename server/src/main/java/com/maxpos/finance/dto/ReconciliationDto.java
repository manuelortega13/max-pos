package com.maxpos.finance.dto;

import com.maxpos.finance.AccountReconciliation;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record ReconciliationDto(
        UUID id,
        UUID accountId,
        String accountName,
        Instant countedAt,
        UUID countedById,
        String countedByName,
        BigDecimal expectedAmount,
        BigDecimal countedAmount,
        BigDecimal variance,
        String note,
        UUID adjustmentMovementId,
        Instant voidedAt,
        UUID voidedById,
        String voidedByName
) {
    public static ReconciliationDto from(AccountReconciliation r) {
        return new ReconciliationDto(
                r.getId(),
                r.getAccount() != null ? r.getAccount().getId() : null,
                r.getAccount() != null ? r.getAccount().getName() : null,
                r.getCountedAt(),
                r.getCountedBy() != null ? r.getCountedBy().getId() : null,
                r.getCountedBy() != null ? r.getCountedBy().getName() : null,
                r.getExpectedAmount(),
                r.getCountedAmount(),
                r.getVariance(),
                r.getNote(),
                r.getAdjustmentMovement() != null ? r.getAdjustmentMovement().getId() : null,
                r.getVoidedAt(),
                r.getVoidedBy() != null ? r.getVoidedBy().getId() : null,
                r.getVoidedBy() != null ? r.getVoidedBy().getName() : null
        );
    }
}
