package com.maxpos.finance.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.UUID;

public record ReconcileRequest(
        @NotNull UUID accountId,
        @NotNull @DecimalMin(value = "0.00") BigDecimal countedAmount,
        @Size(max = 2048) String note
) {}
