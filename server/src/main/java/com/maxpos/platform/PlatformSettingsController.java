package com.maxpos.platform;

import com.maxpos.platform.dto.PlatformSettingsDto;
import com.maxpos.platform.dto.UpdatePlatformSettingsRequest;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/** Platform settings. Platform admins only. */
@RestController
@RequestMapping("/api/platform/settings")
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class PlatformSettingsController {

    private final PlatformSettingsService service;

    public PlatformSettingsController(PlatformSettingsService service) {
        this.service = service;
    }

    @GetMapping
    public PlatformSettingsDto get() {
        return service.get();
    }

    @PutMapping
    public PlatformSettingsDto update(@Valid @RequestBody UpdatePlatformSettingsRequest req) {
        return service.update(req);
    }
}
