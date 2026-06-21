package com.maxpos.subscription.dto;

import java.util.List;

/**
 * Selectable plans for the choose-a-plan page. Each plan carries its own
 * currency and (where a rate is available) a price converted into the store's
 * currency — see {@link StorePlanDto}. {@code storeCurrency} is the store's own
 * currency, shown in the page header.
 */
public record StorePlansResponse(
        String storeCurrency,
        String storeSymbol,
        List<StorePlanDto> plans
) {}
