package com.maxpos.product.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record ProductUpsertRequest(
        @NotBlank @Size(max = 255) String name,
        @NotBlank @Size(max = 64) String sku,
        /**
         * Scan codes for this product. Empty list = no barcodes
         * (the product can only be looked up by name/SKU). Each code
         * is max 64 chars; the whole list is capped at 32 entries
         * so a runaway client can't bloat the row.
         */
        @Size(max = 32) List<@Size(max = 64) String> barcodes,
        @NotNull @DecimalMin("0.00") BigDecimal price,
        @NotNull @DecimalMin("0.00") BigDecimal cost,
        @Min(0) int stock,
        @NotNull UUID categoryId,
        @Size(max = 16) String image,
        // Base64 data URL of the product photo. Frontend resizes to ~400px JPEG
        // before sending, so realistic size is 30-80KB per product. Limit set
        // to 2 MiB to reject anything wildly oversized.
        @Size(max = 2_097_152) String imageUrl,
        @Size(max = 2048) String description,
        boolean active
) {}
