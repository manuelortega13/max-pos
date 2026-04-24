package com.maxpos.expense.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

public record ExpenseUpsertRequest(
        @NotNull LocalDate date,
        @Size(max = 64) String category,
        @NotBlank @Size(max = 2048) String description,
        @NotNull @DecimalMin("0.00") BigDecimal amount
) {}
