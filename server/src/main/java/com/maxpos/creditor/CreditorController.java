package com.maxpos.creditor;

import com.maxpos.creditor.dto.CreditorDto;
import com.maxpos.creditor.dto.CreditorPaymentDto;
import com.maxpos.creditor.dto.CreditorUpsertRequest;
import com.maxpos.sale.dto.SaleDto;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/creditors")
public class CreditorController {

    private final CreditorService service;
    private final CreditorPaymentService paymentService;

    public CreditorController(CreditorService service, CreditorPaymentService paymentService) {
        this.service = service;
        this.paymentService = paymentService;
    }

    /** Active-only list — used by the POS picker. Available to any
     *  authenticated user so cashiers can pick a creditor at checkout
     *  without admin involvement. */
    @GetMapping("/active")
    public List<CreditorDto> listActive() {
        return service.listActive();
    }

    /** Full list including inactive — admin-only (Creditors page). */
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<CreditorDto> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public CreditorDto get(@PathVariable UUID id) {
        return service.get(id);
    }

    /** Purchase history (sales) for a single creditor. Drives the
     *  Sales table on /admin/creditors/:id. */
    @GetMapping("/{id}/sales")
    @PreAuthorize("hasRole('ADMIN')")
    public List<SaleDto> listSales(@PathVariable UUID id) {
        return service.listSales(id);
    }

    /** Payment history (settlements) for a single creditor. Drives
     *  the Payments table on /admin/creditors/:id. */
    @GetMapping("/{id}/payments")
    @PreAuthorize("hasRole('ADMIN')")
    public List<CreditorPaymentDto> listPayments(@PathVariable UUID id) {
        return paymentService.listByCreditor(id);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public CreditorDto create(@Valid @RequestBody CreditorUpsertRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public CreditorDto update(@PathVariable UUID id, @Valid @RequestBody CreditorUpsertRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(id);
    }
}
