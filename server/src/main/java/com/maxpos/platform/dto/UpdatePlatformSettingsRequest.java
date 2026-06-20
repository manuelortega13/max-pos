package com.maxpos.platform.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Update the platform's default currency. */
public record UpdatePlatformSettingsRequest(
        @NotBlank @Size(max = 8) String defaultCurrency,
        @NotBlank @Size(max = 8) String defaultCurrencySymbol
) {}
