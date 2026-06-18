package com.maxpos.businessday.dto;

import java.math.BigDecimal;

/**
 * Aggregated totals for a business day. Produced by the shared
 * aggregation used by both the Close Day preview (read-only, live) and
 * the actual close (which freezes these onto the snapshot) — so the
 * preview can never drift from what the close will record.
 *
 * Money fields are gross: every sale counts toward sales totals, with
 * refunds reported as a separate offsetting line (mirrors the cash-drawer
 * flow). {@code totalCreditPayments} is display-only (all methods); the
 * close snapshot persists only the cash slice, {@code cashCreditPayments}.
 */
public record DayTotalsDto(
        BigDecimal cashSales,
        BigDecimal cashRefunds,
        BigDecimal cardSales,
        BigDecimal transferSales,
        BigDecimal gcashSales,
        BigDecimal mayaSales,
        BigDecimal bankSales,
        BigDecimal creditSales,
        BigDecimal cashCreditPayments,
        BigDecimal totalCreditPayments,
        BigDecimal gcashCashInAmount,
        BigDecimal gcashCashInFees,
        BigDecimal gcashCashOutAmount,
        BigDecimal gcashCashOutFees,
        BigDecimal loadAmount,
        BigDecimal loadFees,
        BigDecimal floatAdditions,
        BigDecimal totalSales,
        BigDecimal totalRefunds,
        int salesCount,
        int itemsSold
) {}
