package com.maxpos.subscription.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * A selectable plan for the store owner.
 *
 * <p>{@code priceCents} is the plan's native price in its own currency
 * ({@code currency}/{@code currencySymbol}). {@code displayPriceCents} is what
 * to show: converted into the store's currency when {@code converted} is true
 * (at {@code rate} = display units per 1 unit of the plan currency), otherwise
 * the native price. {@code displayCurrency}/{@code displaySymbol} is the
 * currency the displayed amount is in.
 */
public record StorePlanDto(
        UUID id,
        String code,
        String name,
        int trialDays,
        Integer maxUsers,
        Integer maxProducts,
        int priceCents,
        String currency,
        String currencySymbol,
        int displayPriceCents,
        String displayCurrency,
        String displaySymbol,
        boolean converted,
        BigDecimal rate
) {}
