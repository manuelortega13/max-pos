package com.maxpos.product.dto;

import java.math.BigDecimal;

/**
 * Whole-catalog inventory summary for the Inventory page's top cards.
 * Deliberately ignores the table's filters — the cards describe the
 * entire catalog so "low/out of stock" counts don't collapse to 0 the
 * moment the admin searches or filters.
 *
 * {@code totalUnits} is a plain sum of computed stock (can be dragged
 * down by oversold/negative rows, matching the old client math);
 * {@code outOfStock} counts stock ≤ 0 so oversold SKUs aren't dropped.
 */
public record InventoryStatsDto(
        long totalProducts,
        long totalUnits,
        BigDecimal totalValue,
        long lowStock,
        long outOfStock
) {}
