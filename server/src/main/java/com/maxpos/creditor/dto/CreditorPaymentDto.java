package com.maxpos.creditor.dto;

import com.maxpos.creditor.CreditorPayment;
import com.maxpos.sale.PaymentMethod;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Wire format for a creditor payment. Voided payments still surface
 * here (with {@link #voidedAt} populated) so the UI can render them
 * with a strikethrough — they don't disappear from history, they
 * just stop counting toward the balance.
 */
public record CreditorPaymentDto(
        UUID id,
        UUID creditorId,
        String creditorName,
        BigDecimal amount,
        PaymentMethod paymentMethod,
        UUID cashierId,
        String cashierName,
        UUID businessDayId,
        Instant date,
        String reference,
        String notes,
        Instant voidedAt,
        UUID voidedById,
        String voidedByName
) {
    public static CreditorPaymentDto from(CreditorPayment p) {
        return new CreditorPaymentDto(
                p.getId(),
                p.getCreditor() != null ? p.getCreditor().getId() : null,
                p.getCreditor() != null ? p.getCreditor().getFullName() : null,
                p.getAmount(),
                p.getPaymentMethod(),
                p.getCashier() != null ? p.getCashier().getId() : null,
                p.getCashier() != null ? p.getCashier().getName() : null,
                p.getBusinessDay() != null ? p.getBusinessDay().getId() : null,
                p.getDate(),
                p.getReference(),
                p.getNotes(),
                p.getVoidedAt(),
                p.getVoidedBy() != null ? p.getVoidedBy().getId() : null,
                p.getVoidedBy() != null ? p.getVoidedBy().getName() : null
        );
    }
}
