package com.maxpos.platform.dto;

import java.time.Instant;
import java.util.UUID;

/** A store's user as listed in the platform console's store detail. */
public record StoreUserDto(
        UUID id,
        String name,
        String email,
        String role,
        boolean active,
        Instant createdAt
) {}
