package com.maxpos.businessday.dto;

import com.maxpos.businessday.FloatAddition;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record FloatAdditionDto(
        UUID id,
        UUID businessDayId,
        BigDecimal amount,
        String note,
        Instant addedAt,
        UUID addedById,
        String addedByName,
        Instant voidedAt,
        UUID voidedById,
        String voidedByName
) {
    public static FloatAdditionDto from(FloatAddition a) {
        return new FloatAdditionDto(
                a.getId(),
                a.getBusinessDay() != null ? a.getBusinessDay().getId() : null,
                a.getAmount(),
                a.getNote(),
                a.getAddedAt(),
                a.getAddedBy() != null ? a.getAddedBy().getId() : null,
                a.getAddedBy() != null ? a.getAddedBy().getName() : null,
                a.getVoidedAt(),
                a.getVoidedBy() != null ? a.getVoidedBy().getId() : null,
                a.getVoidedBy() != null ? a.getVoidedBy().getName() : null
        );
    }
}
