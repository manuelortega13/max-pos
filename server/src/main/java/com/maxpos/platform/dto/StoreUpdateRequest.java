package com.maxpos.platform.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Platform admin edit of a store's identity. */
public record StoreUpdateRequest(
        @NotBlank @Size(max = 255) String name,
        @NotBlank @Size(max = 64)
        @Pattern(regexp = "[a-z0-9-]+", message = "slug must be lowercase letters, numbers, and hyphens")
        String slug
) {}
