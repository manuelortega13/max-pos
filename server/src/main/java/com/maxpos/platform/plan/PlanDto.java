package com.maxpos.platform.plan;

import java.time.Instant;
import java.util.UUID;

/** A plan as shown in the console. Null limits mean unlimited. */
public record PlanDto(
        UUID id,
        String code,
        String name,
        int priceCents,
        Integer maxUsers,
        Integer maxProducts,
        int sortOrder,
        boolean active,
        Instant createdAt
) {
    public static PlanDto from(Plan p) {
        return new PlanDto(p.getId(), p.getCode(), p.getName(), p.getPriceCents(),
                p.getMaxUsers(), p.getMaxProducts(), p.getSortOrder(), p.isActive(), p.getCreatedAt());
    }
}
