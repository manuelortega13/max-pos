package com.maxpos.dashboard.dto;

import java.math.BigDecimal;

/**
 * Range aggregates for the admin Reports page, computed server-side across
 * sales + GCash + load. The client combines these with the expenses it
 * already loads to produce revenue, gross/net profit, and margin.
 *
 *   productRevenue  Σ completed-sale totals in the range
 *   cogs            Σ coalesce(unitCost, product.cost) × qty for those sales
 *   gcashFees       GCash completed (non-voided) fee revenue
 *   loadFees        Load completed (non-voided) fee revenue
 */
public record ReportSummaryDto(
        BigDecimal productRevenue,
        BigDecimal cogs,
        BigDecimal gcashFees,
        BigDecimal loadFees,
        long salesCount
) {}
