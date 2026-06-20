package com.maxpos.platform;

import com.maxpos.platform.dto.CreatePlatformAdminRequest;
import com.maxpos.platform.dto.PlatformAdminDto;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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
}
