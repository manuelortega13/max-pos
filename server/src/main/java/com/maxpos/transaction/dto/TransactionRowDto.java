package com.maxpos.transaction.dto;

import com.maxpos.transaction.TransactionFeedRow;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One row of the unified admin transaction feed. Mirrors the
 * {@code transaction_feed} view; the frontend derives display labels
 * (type label/icon) from {@code kind} so this stays presentation-free.
 */
public record TransactionRowDto(
        UUID id,
        String kind,
        String source,
        String reference,
        Instant date,
        UUID cashierId,
        String cashierName,
        Integer itemsCount,
        String paymentLabel,
        BigDecimal principal,
        BigDecimal fee,
        String status
) {
    public static TransactionRowDto from(TransactionFeedRow r) {
        return new TransactionRowDto(
                r.getId(),
                r.getKind(),
                r.getSource(),
                r.getReference(),
                r.getDate(),
                r.getCashierId(),
                r.getCashierName(),
                r.getItemsCount(),
                r.getPaymentLabel(),
                r.getPrincipal(),
                r.getFee(),
                r.getStatus()
        );
    }
}
