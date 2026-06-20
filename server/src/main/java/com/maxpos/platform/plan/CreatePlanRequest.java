package com.maxpos.platform.plan;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Payload to create a plan. Null limits mean unlimited. */
public record CreatePlanRequest(
        @NotBlank @Size(max = 32) String code,
        @NotBlank @Size(max = 80) String name,
        @Min(0) int priceCents,
        @Min(0) Integer maxUsers,
        @Min(0) Integer maxProducts,
        int sortOrder
) {}
