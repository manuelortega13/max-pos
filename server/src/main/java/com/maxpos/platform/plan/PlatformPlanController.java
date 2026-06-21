package com.maxpos.platform.plan;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Subscription-plan catalog. Platform admins only. */
@RestController
@RequestMapping("/api/platform/plans")
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class PlatformPlanController {

    private final PlatformPlanService service;

    public PlatformPlanController(PlatformPlanService service) {
        this.service = service;
    }

    @GetMapping
    public List<PlanDto> list() {
        return service.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PlanDto create(@Valid @RequestBody CreatePlanRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public PlanDto update(@PathVariable UUID id, @Valid @RequestBody CreatePlanRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(id);
    }
}
