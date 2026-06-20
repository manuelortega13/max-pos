package com.maxpos.platform.dto;

import java.util.UUID;

/** Result of a platform-admin login. */
public record PlatformAuthResponse(
        String token,
        AdminInfo admin
) {
    public record AdminInfo(UUID id, String name, String email) {}
}
