package com.maxpos.product.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record ProductUpsertRequest(
        @NotBlank @Size(max = 255) String name,
        @NotBlank @Size(max = 64) String sku,
        // Scan codes for this product. Empty list = no barcodes (look up
        // by name/SKU only). Each code <=64 chars; list capped at 32.
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
        boolean active,
        // Optional expiry date for the opening-balance batch when a new
        // product is created with stock > 0. Null = batch never expires.
        // Ignored on update (stock changes after create go through the
        // Restock flow, which has its own expiry handling).
        LocalDate initialStockExpiry
) {}
