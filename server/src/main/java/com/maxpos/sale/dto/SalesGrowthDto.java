package com.maxpos.sale.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Pre-aggregated data for the dashboard's Sales Growth chart, so the
 * client no longer pulls the entire sales history to bucket it in the
 * browser.
 *
 * {@code points} is one entry per day across the requested window
 * (oldest → newest, zero-filled for days with no sales);
 * {@code previousTotal} is the completed-sale revenue of the immediately
 * preceding window of equal length, for the growth-vs-previous badge.
 */
public record SalesGrowthDto(
        List<DailyRevenue> points,
        BigDecimal previousTotal
) {
    /** One day's completed-sale revenue. {@code date} is a UTC calendar
     *  day, {@code yyyy-MM-dd}. */
    public record DailyRevenue(String date, BigDecimal total) {}
}
