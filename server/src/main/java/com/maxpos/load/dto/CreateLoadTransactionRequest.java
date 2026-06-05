package com.maxpos.load.dto;

import com.maxpos.sale.PaymentMethod;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.UUID;

public record CreateLoadTransactionRequest(
        @NotNull @DecimalMin(value = "0.01", message = "Amount must be positive") BigDecimal amount,
        @NotNull @DecimalMin("0.00") BigDecimal fee,
        @Size(max = 255) String promo,
        @NotBlank @Size(max = 64) String customerPhone,
        @Size(max = 2048) String notes,
        /** CASH (default when null) or CREDIT. Loads support only those two. */
        PaymentMethod paymentMethod,
        /** Required when paymentMethod = CREDIT, forbidden otherwise. */
        UUID creditorId
) {}
