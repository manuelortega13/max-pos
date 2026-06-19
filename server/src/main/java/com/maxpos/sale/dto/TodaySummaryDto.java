package com.maxpos.sale.dto;

import java.math.BigDecimal;

/**
 * Today's headline sales figures for the dashboard KPI tiles, computed
 * server-side so the dashboard doesn't derive them from the full sales
 * list in the browser.
 *
 * {@code revenue} and {@code transactions} cover completed sales on the
 * current UTC calendar day (matching the dashboard's existing "today"
 * boundary). {@code averageTicket} is the all-time average completed-sale
 * total — same scope the tile showed before.
 */
public record TodaySummaryDto(
        BigDecimal revenue,
        long transactions,
        BigDecimal averageTicket
) {}
