package com.maxpos.platform;

import com.maxpos.platform.dto.StoreSummaryDto;
import com.maxpos.platform.dto.StoreUpdateRequest;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Platform console: manage all registered stores. Platform admins only. */
@RestController
@RequestMapping("/api/platform/stores")
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class PlatformStoreController {

    private final PlatformStoreService service;

    public PlatformStoreController(PlatformStoreService service) {
        this.service = service;
    }

    @GetMapping
    public List<StoreSummaryDto> list() {
        return service.listStores();
    }

    @GetMapping("/{id}")
    public StoreSummaryDto get(@PathVariable UUID id) {
        return service.getStore(id);
    }

    @PutMapping("/{id}")
    public StoreSummaryDto update(@PathVariable UUID id, @Valid @RequestBody StoreUpdateRequest req) {
        return service.update(id, req);
    }

    @PostMapping("/{id}/suspend")
    public StoreSummaryDto suspend(@PathVariable UUID id) {
        return service.setStatus(id, StoreStatus.SUSPENDED);
    }

    @PostMapping("/{id}/activate")
    public StoreSummaryDto activate(@PathVariable UUID id) {
        return service.setStatus(id, StoreStatus.ACTIVE);
    }
}
