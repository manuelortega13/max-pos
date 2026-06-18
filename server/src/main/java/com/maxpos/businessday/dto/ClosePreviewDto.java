package com.maxpos.businessday.dto;

import java.math.BigDecimal;

/**
 * Everything the Close Day screen needs in one call: the open day, the
 * live aggregated {@link DayTotalsDto}, and the expected cash in the
 * drawer. Computed server-side so the page no longer pulls the full
 * sales / GCash / load / payment history to aggregate in the browser.
 */
public record ClosePreviewDto(
        BusinessDayDto day,
        DayTotalsDto totals,
        BigDecimal expectedCash
) {}
