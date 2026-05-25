package com.maxpos.creditor.dto;

import com.maxpos.creditor.Creditor;
import com.maxpos.creditor.PaymentTerm;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record CreditorDto(
        UUID id,
        String fullName,
        String phone,
        String address,
        PaymentTerm paymentTerm,
        /** NULL = no limit. */
        BigDecimal creditLimit,
        /** Sum of unrefunded credit-sale totals — server-computed. */
        BigDecimal outstandingBalance,
        boolean active,
        Instant createdAt
) {
    public static CreditorDto from(Creditor c) {
        return new CreditorDto(
                c.getId(),
                c.getFullName(),
                c.getPhone(),
                c.getAddress(),
                c.getPaymentTerm(),
                c.getCreditLimit(),
                c.getOutstandingBalance(),
                c.isActive(),
                c.getCreatedAt()
        );
    }
}
