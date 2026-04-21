package com.maxpos.auth.dto;

import com.maxpos.user.UserRole;

import java.util.UUID;

public record AuthResponse(
        String token,
        UserInfo user
) {
    public record UserInfo(
            UUID id,
            String name,
            String email,
            UserRole role
    ) {}
}
