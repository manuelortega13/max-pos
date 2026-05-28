package com.maxpos.businessday.dto;

import com.maxpos.businessday.BusinessDay;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Wire format for a business day. Close-time fields are null while the day
 * is still open — clients should treat {@code closedAt == null} as "open".
 */
public record BusinessDayDto(
        UUID id,
        Instant openedAt,
        UUID openedById,
        String openedByName,
        BigDecimal openingFloat,
        Instant closedAt,
        UUID closedById,
        String closedByName,
        BigDecimal countedCash,
        String notes,
        BigDecimal expectedCash,
        BigDecimal variance,
        BigDecimal totalSales,
        BigDecimal totalRefunds,
        BigDecimal cashSales,
        BigDecimal cashRefunds,
        BigDecimal cardSales,
        BigDecimal transferSales,
        BigDecimal creditSales,
        BigDecimal cashCreditPayments,
        BigDecimal gcashCashInAmount,
        BigDecimal gcashCashInFees,
        BigDecimal gcashCashOutAmount,
        BigDecimal gcashCashOutFees,
        BigDecimal loadAmount,
        BigDecimal loadFees,
        BigDecimal floatAdditions,
        Integer salesCount,
        Integer itemsSold
) {
    public static BusinessDayDto from(BusinessDay d) {
        return new BusinessDayDto(
                d.getId(),
                d.getOpenedAt(),
                d.getOpenedBy() != null ? d.getOpenedBy().getId() : null,
                d.getOpenedBy() != null ? d.getOpenedBy().getName() : null,
                d.getOpeningFloat(),
                d.getClosedAt(),
                d.getClosedBy() != null ? d.getClosedBy().getId() : null,
                d.getClosedBy() != null ? d.getClosedBy().getName() : null,
                d.getCountedCash(),
                d.getNotes(),
                d.getExpectedCash(),
                d.getVariance(),
                d.getTotalSales(),
                d.getTotalRefunds(),
                d.getCashSales(),
                d.getCashRefunds(),
                d.getCardSales(),
                d.getTransferSales(),
                d.getCreditSales(),
                d.getCashCreditPayments(),
                d.getGcashCashInAmount(),
                d.getGcashCashInFees(),
                d.getGcashCashOutAmount(),
                d.getGcashCashOutFees(),
                d.getLoadAmount(),
                d.getLoadFees(),
                d.getFloatAdditions(),
                d.getSalesCount(),
                d.getItemsSold()
        );
    }
}
