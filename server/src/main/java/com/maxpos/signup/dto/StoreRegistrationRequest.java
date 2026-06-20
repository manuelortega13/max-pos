package com.maxpos.signup.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Public store sign-up: creates a store plus its first admin. Currency and
 * symbol are optional (sensible defaults applied); the admin can change
 * everything later in Settings.
 */
public record StoreRegistrationRequest(
        @NotBlank @Size(max = 255) String storeName,
        @NotBlank @Size(max = 64)
        @Pattern(regexp = "[a-z0-9-]+", message = "store URL may use lowercase letters, numbers, and hyphens")
        String slug,
        @NotBlank @Size(max = 255) String adminName,
        @NotBlank @Email @Size(max = 255) String adminEmail,
        @NotBlank @Size(min = 6, max = 128) String adminPassword,
        @Size(max = 8) String currency,
        @Size(max = 4) String currencySymbol
) {}
