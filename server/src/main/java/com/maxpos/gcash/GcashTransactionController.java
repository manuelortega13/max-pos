package com.maxpos.gcash;

import com.maxpos.gcash.dto.CreateGcashTransactionRequest;
import com.maxpos.gcash.dto.GcashTransactionDto;
import com.maxpos.security.AppUserDetails;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/gcash-transactions")
public class GcashTransactionController {

    private final GcashTransactionService service;

    public GcashTransactionController(GcashTransactionService service) {
        this.service = service;
    }

    /** Calling cashier's own transactions — drives My Transactions. */
    @GetMapping("/mine")
    public List<GcashTransactionDto> mine(@AuthenticationPrincipal AppUserDetails principal) {
        return service.listByCashier(principal.getId());
    }

    /** All transactions — admin-only (End-of-Day live preview). */
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<GcashTransactionDto> list() {
        return service.listAll();
    }

    /** Record a transaction. Any authed user; backend enforces tier-fee match. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public GcashTransactionDto create(@Valid @RequestBody CreateGcashTransactionRequest req,
                                      @AuthenticationPrincipal AppUserDetails principal) {
        return service.create(req, principal.getId());
    }

    /** Admin marks a PENDING cash-in as COMPLETED after sending. */
    @PostMapping("/{id}/complete")
    @PreAuthorize("hasRole('ADMIN')")
    public GcashTransactionDto complete(@PathVariable UUID id,
                                        @AuthenticationPrincipal AppUserDetails principal) {
        return service.complete(id, principal.getId());
    }

    /** Admin soft-void. */
    @PostMapping("/{id}/void")
    @PreAuthorize("hasRole('ADMIN')")
    public GcashTransactionDto voidTransaction(@PathVariable UUID id,
                                               @RequestBody(required = false) VoidRequest body,
                                               @AuthenticationPrincipal AppUserDetails principal) {
        String reason = body == null ? null : body.reason();
        return service.voidTransaction(id, principal.getId(), reason);
    }

    public record VoidRequest(String reason) {}
}
