package com.maxpos.platform.dto;

import com.maxpos.platform.PlatformSetting;

import java.time.Instant;

/** Platform settings as shown/edited in the super-admin console. */
public record PlatformSettingsDto(
        String defaultCurrency,
        String defaultCurrencySymbol,
        Instant updatedAt
) {
    public static PlatformSettingsDto from(PlatformSetting s) {
        return new PlatformSettingsDto(
                s.getDefaultCurrency(), s.getDefaultCurrencySymbol(), s.getUpdatedAt());
    }
}
