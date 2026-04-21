package com.maxpos.sale.dto;

import com.maxpos.sale.PaymentMethod;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.UUID;

public record CreateSaleRequest(
        @NotEmpty @Valid List<Line> items,
        @NotNull PaymentMethod paymentMethod
) {
    public record Line(
            @NotNull UUID productId,
            @Min(1) int quantity
    ) {}
}
