package com.maxpos.gcash.dto;

import com.maxpos.gcash.GcashFeeTier;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record GcashFeeTierDto(
        UUID id,
        BigDecimal minAmount,
        BigDecimal maxAmount,
        BigDecimal fee,
        boolean active,
        Instant createdAt
) {
    public static GcashFeeTierDto from(GcashFeeTier t) {
        return new GcashFeeTierDto(
                t.getId(), t.getMinAmount(), t.getMaxAmount(),
                t.getFee(), t.isActive(), t.getCreatedAt()
        );
    }
}
