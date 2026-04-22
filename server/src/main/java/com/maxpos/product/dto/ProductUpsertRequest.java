package com.maxpos.product.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.UUID;

public record ProductUpsertRequest(
        @NotBlank @Size(max = 255) String name,
        @NotBlank @Size(max = 64) String sku,
        @Size(max = 64) String barcode,
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
