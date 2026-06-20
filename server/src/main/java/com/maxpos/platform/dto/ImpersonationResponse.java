package com.maxpos.platform.dto;

import java.util.UUID;

/**
 * Result of a platform admin impersonating a store: a normal store token
 * (acting as that store's admin) plus context for the console UI.
 */
public record ImpersonationResponse(
        String token,
        UUID storeId,
        String storeName,
        String actingAsEmail
) {}
