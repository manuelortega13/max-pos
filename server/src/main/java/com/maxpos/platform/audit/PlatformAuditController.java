package com.maxpos.platform.audit;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Platform activity log. Platform admins only. */
@RestController
@RequestMapping("/api/platform/audit")
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class PlatformAuditController {

    private final PlatformAuditService service;

    public PlatformAuditController(PlatformAuditService service) {
        this.service = service;
    }

    @GetMapping
    public List<PlatformAuditDto> recent(@RequestParam(defaultValue = "100") int limit) {
        return service.recent(limit).stream().map(PlatformAuditDto::from).toList();
    }
}
