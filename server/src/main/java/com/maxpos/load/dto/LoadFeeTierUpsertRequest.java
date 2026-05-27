package com.maxpos.load.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;

public record LoadFeeTierUpsertRequest(
        @NotNull @DecimalMin("0.00") BigDecimal minAmount,
        @NotNull @DecimalMin("0.01") BigDecimal maxAmount,
        @NotNull @DecimalMin("0.00") BigDecimal fee,
        boolean active
) {}
