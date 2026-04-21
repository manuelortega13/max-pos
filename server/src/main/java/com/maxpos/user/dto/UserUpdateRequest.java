package com.maxpos.user.dto;

import com.maxpos.user.UserRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UserUpdateRequest(
        @NotBlank @Size(max = 255) String name,
        @Email @NotBlank String email,
        @NotNull UserRole role,
        @NotNull Boolean active,
        @Size(min = 8, max = 128) String password
) {}
