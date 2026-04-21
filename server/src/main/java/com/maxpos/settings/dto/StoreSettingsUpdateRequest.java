package com.maxpos.settings.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;

public record StoreSettingsUpdateRequest(
        @NotBlank @Size(max = 255) String storeName,
        @NotBlank @Size(max = 8) String currency,
        @NotBlank @Size(max = 4) String currencySymbol,
        @NotNull @DecimalMin("0.0000") @DecimalMax("1.0000") BigDecimal taxRate,
        @Size(max = 2048) String receiptFooter,
        @Size(max = 255) String address,
        @Size(max = 64) String phone
) {}
