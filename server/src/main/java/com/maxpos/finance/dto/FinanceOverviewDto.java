package com.maxpos.finance.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Top-of-page summary for /admin/finances. Net is the sum of every
 * active account's balance — the headline "what does the business
 * have right now" number.
 */
public record FinanceOverviewDto(
        BigDecimal net,
        List<AccountSummaryDto> accounts,
        /** All-account in/out totals for the rolling 30 days (a
         *  rough operational pulse — accountants who want strict
         *  per-account periods read the per-account periodIn/Out
         *  on each AccountSummaryDto instead). */
        BigDecimal periodIn,
        BigDecimal periodOut
) {}
