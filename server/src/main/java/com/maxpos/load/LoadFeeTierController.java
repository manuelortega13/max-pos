package com.maxpos.load;

import com.maxpos.load.dto.LoadFeeTierDto;
import com.maxpos.load.dto.LoadFeeTierUpsertRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/load/fee-tiers")
public class LoadFeeTierController {

    private final LoadFeeTierService service;

    public LoadFeeTierController(LoadFeeTierService service) {
        this.service = service;
    }

    /** Public to any authed user — cashier UI needs the lookup. */
    @GetMapping("/lookup")
    public ResponseEntity<LoadFeeTierDto> lookup(@RequestParam BigDecimal amount) {
        return service.lookup(amount)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<LoadFeeTierDto> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public LoadFeeTierDto get(@PathVariable UUID id) {
        return service.get(id);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public LoadFeeTierDto create(@Valid @RequestBody LoadFeeTierUpsertRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public LoadFeeTierDto update(@PathVariable UUID id,
                                 @Valid @RequestBody LoadFeeTierUpsertRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(id);
    }
}
