package com.maxpos.finance.dto;

import com.maxpos.finance.AccountKind;
import jakarta.validation.constraints.*;

public record AccountUpsertRequest(
        @NotBlank @Size(max = 64) String name,
        @NotNull AccountKind kind,
        boolean active,
        int sortOrder
) {}
