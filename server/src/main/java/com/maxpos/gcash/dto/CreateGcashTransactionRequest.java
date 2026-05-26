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
        @Size(max = 2048) String notes
) {}
