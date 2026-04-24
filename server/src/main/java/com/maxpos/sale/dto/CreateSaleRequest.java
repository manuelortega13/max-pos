package com.maxpos.sale.dto;

import com.maxpos.sale.DiscountType;
import com.maxpos.sale.PaymentMethod;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record CreateSaleRequest(
        @NotEmpty @Valid List<Line> items,
        @NotNull PaymentMethod paymentMethod,
        /*
         * Optional client-generated identifier used by the offline queue.
         * When supplied it becomes the sale's {@code reference}, which is
         * unique — so a replayed POST with the same clientRef yields the
         * same sale instead of creating a duplicate.
         */
        @Size(max = 64) String clientRef,
        /** Order-level discount, applied after line discounts and before tax. */
        @Valid Discount discount
) {
    public record Line(
            @NotNull UUID productId,
            @Min(1) int quantity,
            /** Per-line discount, applied against unit_price × quantity. */
            @Valid Discount discount
    ) {}

    /**
     * Discount carrier used both per-line and at the order level. {@code value}
     * is the raw cashier input — the percentage (0-100) when type=PERCENT,
     * the money amount when type=FIXED. The backend recomputes the actual
     * amount-off rather than trusting the client.
     */
    public record Discount(
            @NotNull DiscountType type,
            @NotNull @DecimalMin("0.0") BigDecimal value
    ) {}
}
