package com.maxpos.platform.dto;

import com.maxpos.platform.PlatformAdmin;

import java.time.Instant;
import java.util.UUID;

/** A platform admin account as shown in the console's admins list. */
public record PlatformAdminDto(
        UUID id,
        String name,
        String email,
        boolean active,
        Instant createdAt
) {
    public static PlatformAdminDto from(PlatformAdmin a) {
        return new PlatformAdminDto(a.getId(), a.getName(), a.getEmail(), a.isActive(), a.getCreatedAt());
    }
}
