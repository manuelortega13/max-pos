package com.maxpos.product.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.UUID;

public record ProductUpsertRequest(
        @NotBlank @Size(max = 255) String name,
        @NotBlank @Size(max = 64) String sku,
        @NotBlank @Size(max = 64) String barcode,
        @NotNull @DecimalMin("0.00") BigDecimal price,
        @NotNull @DecimalMin("0.00") BigDecimal cost,
        @Min(0) int stock,
        @NotNull UUID categoryId,
        @Size(max = 16) String image,
        @Size(max = 2048) String description,
        boolean active
) {}
