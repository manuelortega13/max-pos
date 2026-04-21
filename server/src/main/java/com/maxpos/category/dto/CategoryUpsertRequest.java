package com.maxpos.category.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CategoryUpsertRequest(
        @NotBlank @Size(max = 255) String name,
        @Size(max = 1024) String description,
        @NotBlank @Size(max = 16) String color,
        @NotBlank @Size(max = 64) String icon
) {}
