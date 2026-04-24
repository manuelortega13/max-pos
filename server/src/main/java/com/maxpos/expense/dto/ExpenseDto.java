package com.maxpos.expense.dto;

import com.maxpos.expense.Expense;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record ExpenseDto(
        UUID id,
        LocalDate date,
        String category,
        String description,
        BigDecimal amount,
        Instant createdAt,
        UUID createdById,
        String createdByName
) {
    public static ExpenseDto from(Expense e) {
        return new ExpenseDto(
                e.getId(),
                e.getDate(),
                e.getCategory(),
                e.getDescription(),
                e.getAmount(),
                e.getCreatedAt(),
                e.getCreatedBy() != null ? e.getCreatedBy().getId() : null,
                e.getCreatedBy() != null ? e.getCreatedBy().getName() : null
        );
    }
}
