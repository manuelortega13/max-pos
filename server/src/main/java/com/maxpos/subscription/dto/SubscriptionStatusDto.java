package com.maxpos.subscription.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * The current store's subscription state, for the owner-facing plan flow.
 * {@code hasPlan} is false right after sign-up (forces the choose-a-plan step).
 */
public record SubscriptionStatusDto(
        boolean hasPlan,
        UUID planId,
        String planCode,
        String planName,
        int priceCents,
        boolean onTrial,
        Instant trialEndsAt,
        Integer trialDaysLeft,
        String storeStatus
) {}
