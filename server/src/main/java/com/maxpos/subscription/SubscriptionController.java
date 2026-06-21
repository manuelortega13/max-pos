package com.maxpos.subscription;

import com.maxpos.security.AppUserDetails;
import com.maxpos.subscription.dto.StorePlansResponse;
import com.maxpos.subscription.dto.SubscribeRequest;
import com.maxpos.subscription.dto.SubscriptionStatusDto;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * Owner-facing subscription endpoints. Admin-only (the store owner picks the
 * plan after sign-up). Scoped to the caller's own store via the principal.
 */
@RestController
@RequestMapping("/api")
@PreAuthorize("hasRole('ADMIN')")
public class SubscriptionController {

    private final SubscriptionService service;

    public SubscriptionController(SubscriptionService service) {
        this.service = service;
    }

    @GetMapping("/plans")
    public StorePlansResponse plans() {
        return service.selectablePlans();
    }

    @GetMapping("/subscription")
    public SubscriptionStatusDto status(@AuthenticationPrincipal AppUserDetails principal) {
        return service.status(principal.getStoreId());
    }

    @PostMapping("/subscription")
    public SubscriptionStatusDto subscribe(@AuthenticationPrincipal AppUserDetails principal,
                                           @Valid @RequestBody SubscribeRequest req) {
        return service.subscribe(principal.getStoreId(), req.planId());
    }
}
