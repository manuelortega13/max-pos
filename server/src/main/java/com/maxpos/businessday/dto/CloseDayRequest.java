package com.maxpos.businessday.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record CloseDayRequest(
        @NotNull @DecimalMin("0.00") BigDecimal countedCash,
        @Size(max = 2048) String notes
) {}
