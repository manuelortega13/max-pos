package com.maxpos.creditor.dto;

import com.maxpos.creditor.PaymentTerm;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;

public record CreditorUpsertRequest(
        @NotBlank @Size(max = 255) String fullName,
        @NotBlank @Size(max = 64) String phone,
        @Size(max = 2048) String address,
        @NotNull PaymentTerm paymentTerm,
        /** NULL = no credit limit. Must be >= 0 when set. */
        @DecimalMin("0.00") BigDecimal creditLimit,
        boolean active
) {}
