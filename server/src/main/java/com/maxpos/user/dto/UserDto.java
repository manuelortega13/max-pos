package com.maxpos.user.dto;

import com.maxpos.user.User;
import com.maxpos.user.UserRole;

import java.time.Instant;
import java.util.UUID;

public record UserDto(
        UUID id,
        String name,
        String email,
        UserRole role,
        boolean active,
        Instant createdAt
) {
    public static UserDto from(User u) {
        return new UserDto(u.getId(), u.getName(), u.getEmail(), u.getRole(), u.isActive(), u.getCreatedAt());
    }
}
