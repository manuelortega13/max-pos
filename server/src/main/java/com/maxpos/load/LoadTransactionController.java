package com.maxpos.load;

import com.maxpos.load.dto.CreateLoadTransactionRequest;
import com.maxpos.load.dto.LoadTransactionDto;
import com.maxpos.security.AppUserDetails;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/load-transactions")
public class LoadTransactionController {

    private final LoadTransactionService service;

    public LoadTransactionController(LoadTransactionService service) {
        this.service = service;
    }

    @GetMapping("/mine")
    public List<LoadTransactionDto> mine(@AuthenticationPrincipal AppUserDetails principal) {
        return service.listByCashier(principal.getId());
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<LoadTransactionDto> list() {
        return service.listAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public LoadTransactionDto create(@Valid @RequestBody CreateLoadTransactionRequest req,
                                     @AuthenticationPrincipal AppUserDetails principal) {
        return service.create(req, principal.getId());
    }

    @PostMapping("/{id}/complete")
    @PreAuthorize("hasRole('ADMIN')")
    public LoadTransactionDto complete(@PathVariable UUID id,
                                       @AuthenticationPrincipal AppUserDetails principal) {
        return service.complete(id, principal.getId());
    }

    @PostMapping("/{id}/void")
    @PreAuthorize("hasRole('ADMIN')")
    public LoadTransactionDto voidTransaction(@PathVariable UUID id,
                                              @RequestBody(required = false) VoidRequest body,
                                              @AuthenticationPrincipal AppUserDetails principal) {
        String reason = body == null ? null : body.reason();
        return service.voidTransaction(id, principal.getId(), reason);
    }

    public record VoidRequest(String reason) {}
}
