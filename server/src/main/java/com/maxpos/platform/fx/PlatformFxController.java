package com.maxpos.platform.fx;

import com.maxpos.platform.PlatformSettingsService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Live FX rates into the platform currency. Platform admins only. */
@RestController
@RequestMapping("/api/platform/fx")
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class PlatformFxController {

    private final FxRateService fxService;
    private final PlatformSettingsService platformSettings;

    public PlatformFxController(FxRateService fxService, PlatformSettingsService platformSettings) {
        this.fxService = fxService;
        this.platformSettings = platformSettings;
    }

    @GetMapping
    public FxRatesDto rates() {
        String base = platformSettings.get().defaultCurrency();
        return FxRatesDto.from(fxService.snapshot(base));
    }
}
