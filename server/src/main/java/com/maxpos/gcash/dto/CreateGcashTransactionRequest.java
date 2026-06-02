package com.maxpos.gcash.dto;

import com.maxpos.gcash.GcashTransactionType;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;

public record CreateGcashTransactionRequest(
        @NotNull GcashTransactionType type,
        @NotNull @DecimalMin(value = "0.01", message = "Amount must be positive") BigDecimal amount,
        @NotNull @DecimalMin("0.00") BigDecimal fee,
        @Size(max = 255) String customerName,
        @Size(max = 64) String customerPhone,
        @Size(max = 64) String inboundRef,
        @Size(max = 2048) String notes,
        // Cash-out only. When true, the customer's GCash send already
        // includes the fee, so the tier table is matched against
        // (amount − fee). When false / null (default), the tier is
        // matched against amount as-is. Storage isn't affected — this
        // flag only steers the server-side fee-vs-tier validation so
        // it agrees with the cashier's toggle.
        Boolean feeIncluded
) {}
