package com.maxpos.platform.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One store as shown in the platform console — identity, status, and
 * cross-store stats. Built from the native stats query.
 */
public record StoreSummaryDto(
        UUID id,
        String name,
        String slug,
        String status,
        Instant createdAt,
        long users,
        long products,
        long sales,
        BigDecimal revenue,
        Instant lastSaleAt,
        // Assigned plan + its limits (all null when no plan; limits null = unlimited).
        UUID planId,
        String planName,
        Integer maxUsers,
        Integer maxProducts
) {}
