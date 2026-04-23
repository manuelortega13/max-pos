package com.maxpos.sale;

import com.maxpos.sale.dto.CreateSaleRequest;
import com.maxpos.sale.dto.SaleDto;
import com.maxpos.security.AppUserDetails;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/sales")
public class SaleController {

    private final SaleService service;

    public SaleController(SaleService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<SaleDto> list() {
        return service.list();
    }

    @GetMapping("/mine")
    public List<SaleDto> mine(@AuthenticationPrincipal AppUserDetails principal) {
        return service.listByCashier(principal.getId());
    }

    @GetMapping("/{id}")
    public SaleDto get(@PathVariable UUID id) {
        return service.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SaleDto create(@Valid @RequestBody CreateSaleRequest req,
                          @AuthenticationPrincipal AppUserDetails principal) {
        return service.create(req, principal.getId());
    }

    @PostMapping("/{id}/refund")
    public SaleDto refund(@PathVariable UUID id,
                          @RequestBody(required = false) RefundRequest body,
                          @AuthenticationPrincipal AppUserDetails principal) {
        String reason = body == null ? null : body.reason();
        return service.refund(id, principal.getId(), principal.isAdmin(), reason);
    }

    public record RefundRequest(String reason) {}
}
