package com.maxpos.creditor;

import com.maxpos.creditor.dto.CreateCreditorPaymentRequest;
import com.maxpos.creditor.dto.CreditorPaymentDto;
import com.maxpos.security.AppUserDetails;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/creditor-payments")
public class CreditorPaymentController {

    private final CreditorPaymentService service;

    public CreditorPaymentController(CreditorPaymentService service) {
        this.service = service;
    }

    /** Calling cashier's own payments — drives "My Transactions". */
    @GetMapping("/mine")
    public List<CreditorPaymentDto> mine(@AuthenticationPrincipal AppUserDetails principal) {
        return service.listByCashier(principal.getId());
    }

    /** All payments, newest first — admin-only (End-of-Day live preview). */
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<CreditorPaymentDto> list() {
        return service.listAll();
    }

    /** Record a payment. Any authed user — cashiers run this. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CreditorPaymentDto create(@Valid @RequestBody CreateCreditorPaymentRequest req,
                                     @AuthenticationPrincipal AppUserDetails principal) {
        return service.create(req, principal.getId());
    }

    /** Soft-void a payment. Admin-only — voiding restores the
     *  creditor's balance and is an audit event. */
    @PostMapping("/{id}/void")
    @PreAuthorize("hasRole('ADMIN')")
    public CreditorPaymentDto voidPayment(@PathVariable UUID id,
                                          @RequestBody(required = false) VoidRequest body,
                                          @AuthenticationPrincipal AppUserDetails principal) {
        String reason = body == null ? null : body.reason();
        return service.voidPayment(id, principal.getId(), reason);
    }

    public record VoidRequest(String reason) {}
}
