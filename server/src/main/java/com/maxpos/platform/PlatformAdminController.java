package com.maxpos.platform;

import com.maxpos.platform.dto.CreatePlatformAdminRequest;
import com.maxpos.platform.dto.PlatformAdminDto;
import com.maxpos.platform.dto.SetActiveRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Platform-admin account management. Platform admins only. */
@RestController
@RequestMapping("/api/platform/admins")
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class PlatformAdminController {

    private final PlatformAdminService service;

    public PlatformAdminController(PlatformAdminService service) {
        this.service = service;
    }

    @GetMapping
    public List<PlatformAdminDto> list() {
        return service.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PlatformAdminDto create(@Valid @RequestBody CreatePlatformAdminRequest req) {
        return service.create(req);
    }

    /** Enable or disable an admin account. */
    @PutMapping("/{id}/status")
    public PlatformAdminDto setActive(@PathVariable UUID id, @RequestBody SetActiveRequest req) {
        return service.setActive(id, req.active());
    }
}
