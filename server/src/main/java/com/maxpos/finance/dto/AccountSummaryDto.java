package com.maxpos.finance.dto;

import com.maxpos.finance.AccountKind;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Per-account row on the Finances overview. Bundles balance, period
 * totals (since-last-reconciliation), and the last-reconciliation
 * meta so the UI can render the card without a second round-trip.
 */
public record AccountSummaryDto(
        UUID id,
        String name,
        AccountKind kind,
        boolean active,
        int sortOrder,
        BigDecimal balance,
        /** Sum of IN movements since the last (non-voided) reconciliation
         *  on this account; equals the all-time IN sum when no
         *  reconciliation exists yet. */
        BigDecimal periodIn,
        BigDecimal periodOut,
        /** When the account was last counted-and-confirmed. Null when
         *  there is no reconciliation yet. */
        Instant lastReconciledAt,
        /** Variance recorded at the last reconciliation (counted − expected). */
        BigDecimal lastReconciledVariance
) {}
