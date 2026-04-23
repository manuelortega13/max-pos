package com.maxpos.sale.dto;

import com.maxpos.sale.PaymentMethod;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record CreateSaleRequest(
        @NotEmpty @Valid List<Line> items,
        @NotNull PaymentMethod paymentMethod,
        /*
         * Optional client-generated identifier used by the offline queue.
         * When supplied it becomes the sale's {@code reference}, which is
         * unique — so a replayed POST with the same clientRef yields the
         * same sale instead of creating a duplicate. Null/blank means
         * "server generates a reference" (the original behavior).
         */
        @Size(max = 64) String clientRef
) {
    public record Line(
            @NotNull UUID productId,
            @Min(1) int quantity
    ) {}
}
