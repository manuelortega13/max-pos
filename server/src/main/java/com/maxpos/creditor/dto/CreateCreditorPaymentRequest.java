package com.maxpos.creditor.dto;

import com.maxpos.sale.PaymentMethod;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.UUID;

public record CreateCreditorPaymentRequest(
        @NotNull UUID creditorId,
        @NotNull @DecimalMin(value = "0.01", message = "Amount must be positive") BigDecimal amount,
        /** Method the customer paid with — NOT CREDIT (you can't pay
         *  credit with credit). Service validates this. */
        @NotNull PaymentMethod paymentMethod,
        @Size(max = 2048) String notes
) {}
