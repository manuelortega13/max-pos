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
        int trialDays,
        boolean active,
        Instant createdAt,
        // Stores currently on this plan; the console blocks delete when > 0.
        long subscriberCount,
        // The plan's own pricing currency (set at creation, fixed).
        String currency,
        String currencySymbol
) {
    public static PlanDto from(Plan p, long subscriberCount) {
        return new PlanDto(p.getId(), p.getCode(), p.getName(), p.getPriceCents(),
                p.getMaxUsers(), p.getMaxProducts(), p.getSortOrder(), p.getTrialDays(),
                p.isActive(), p.getCreatedAt(), subscriberCount, p.getCurrency(), p.getCurrencySymbol());
    }
}
