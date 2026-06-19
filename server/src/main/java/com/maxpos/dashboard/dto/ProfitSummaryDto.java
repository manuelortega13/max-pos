package com.maxpos.dashboard.dto;

import java.math.BigDecimal;

/**
 * Raw aggregates for the dashboard's rolling profit-insights window,
 * computed across sales, GCash/Load service fees, and expenses server-side
 * so the dashboard no longer pulls those full lists to total them in the
 * browser. The client derives the ratios (margin, markup, break-even, …)
 * from these — pure presentation math, kept on the client.
 *
 *   salesRevenue  Σ completed-sale totals in the window
 *   cogs          Σ unitCost × qty across those sales' line items
 *   serviceFees   GCash + Load completed (non-voided) fee revenue
 *   expenseTotal  Σ expense amounts in the window
 *   salesCount    number of completed sales (drives the "enough data" gate)
 *   days          window length, echoed back for the per-day divisions
 */
public record ProfitSummaryDto(
        BigDecimal salesRevenue,
        BigDecimal cogs,
        BigDecimal serviceFees,
        BigDecimal expenseTotal,
        long salesCount,
        int days
) {}
