package com.maxpos.businessday.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;

public record CreateFloatAdditionRequest(
        @NotNull @DecimalMin(value = "0.01", message = "Amount must be positive") BigDecimal amount,
        @Size(max = 2048) String note
) {}
