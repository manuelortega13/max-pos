package com.maxpos.finance.dto;

import com.maxpos.finance.AccountMovement;
import com.maxpos.finance.MovementDirection;
import com.maxpos.finance.MovementSourceKind;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record AccountMovementDto(
        UUID id,
        UUID accountId,
        String accountName,
        MovementDirection direction,
        BigDecimal amount,
        String category,
        String note,
        Instant occurredAt,
        UUID recordedById,
        String recordedByName,
        MovementSourceKind sourceKind,
        UUID sourceId,
        UUID transferPairId,
        Instant voidedAt,
        UUID voidedById,
        String voidedByName
) {
    public static AccountMovementDto from(AccountMovement m) {
        return new AccountMovementDto(
                m.getId(),
                m.getAccount() != null ? m.getAccount().getId() : null,
                m.getAccount() != null ? m.getAccount().getName() : null,
                m.getDirection(),
                m.getAmount(),
                m.getCategory(),
                m.getNote(),
                m.getOccurredAt(),
                m.getRecordedBy() != null ? m.getRecordedBy().getId() : null,
                m.getRecordedBy() != null ? m.getRecordedBy().getName() : null,
                m.getSourceKind(),
                m.getSourceId(),
                m.getTransferPair() != null ? m.getTransferPair().getId() : null,
                m.getVoidedAt(),
                m.getVoidedBy() != null ? m.getVoidedBy().getId() : null,
                m.getVoidedBy() != null ? m.getVoidedBy().getName() : null
        );
    }
}
