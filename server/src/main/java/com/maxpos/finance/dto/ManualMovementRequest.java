package com.maxpos.finance.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Manual cash IN or OUT entry. The endpoint URL ({@code /finance/in}
 * vs {@code /finance/out}) determines direction; this DTO carries
 * the amount, target account, category, and free-text note.
 */
public record ManualMovementRequest(
        @NotNull UUID accountId,
        @NotNull @DecimalMin(value = "0.01", message = "Amount must be positive") BigDecimal amount,
        @NotBlank @Size(max = 32) String category,
        @Size(max = 2048) String note
) {}
