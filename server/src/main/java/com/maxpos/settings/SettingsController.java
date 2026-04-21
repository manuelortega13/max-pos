package com.maxpos.settings;

import com.maxpos.settings.dto.StoreSettingsDto;
import com.maxpos.settings.dto.StoreSettingsUpdateRequest;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/settings")
public class SettingsController {

    private final SettingsService service;

    public SettingsController(SettingsService service) {
        this.service = service;
    }

    @GetMapping
    public StoreSettingsDto get() {
        return service.get();
    }

    @PutMapping
    @PreAuthorize("hasRole('ADMIN')")
    public StoreSettingsDto update(@Valid @RequestBody StoreSettingsUpdateRequest req) {
        return service.update(req);
    }
}
