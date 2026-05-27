package com.maxpos.load.dto;

import com.maxpos.load.LoadFeeTier;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record LoadFeeTierDto(
        UUID id,
        BigDecimal minAmount,
        BigDecimal maxAmount,
        BigDecimal fee,
        boolean active,
        Instant createdAt
) {
    public static LoadFeeTierDto from(LoadFeeTier t) {
        return new LoadFeeTierDto(
                t.getId(), t.getMinAmount(), t.getMaxAmount(),
                t.getFee(), t.isActive(), t.getCreatedAt()
        );
    }
}
