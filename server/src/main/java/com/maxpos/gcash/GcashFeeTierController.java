package com.maxpos.gcash;

import com.maxpos.gcash.dto.GcashFeeTierDto;
import com.maxpos.gcash.dto.GcashFeeTierUpsertRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/gcash/fee-tiers")
public class GcashFeeTierController {

    private final GcashFeeTierService service;

    public GcashFeeTierController(GcashFeeTierService service) {
        this.service = service;
    }

    /** Public to any authed user — cashier UI needs the lookup. */
    @GetMapping("/lookup")
    public ResponseEntity<GcashFeeTierDto> lookup(@RequestParam BigDecimal amount) {
        return service.lookup(amount)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /** Listing (active + inactive). Cashier UI doesn't need this —
     *  but admin manages tiers here, so gated to admin. */
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<GcashFeeTierDto> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public GcashFeeTierDto get(@PathVariable UUID id) {
        return service.get(id);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public GcashFeeTierDto create(@Valid @RequestBody GcashFeeTierUpsertRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public GcashFeeTierDto update(@PathVariable UUID id,
                                  @Valid @RequestBody GcashFeeTierUpsertRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(id);
    }
}
