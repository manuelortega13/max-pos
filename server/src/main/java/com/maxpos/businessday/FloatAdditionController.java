package com.maxpos.businessday;

import com.maxpos.businessday.dto.CreateFloatAdditionRequest;
import com.maxpos.businessday.dto.FloatAdditionDto;
import com.maxpos.security.AppUserDetails;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Admin-only endpoints for managing mid-day float top-ups. There's
 * always exactly one open business day, so add/list operate against
 * the current open day implicitly rather than taking a day id.
 */
@RestController
@RequestMapping("/api/business-days/current/float-additions")
@PreAuthorize("hasRole('ADMIN')")
public class FloatAdditionController {

    private final FloatAdditionService service;

    public FloatAdditionController(FloatAdditionService service) {
        this.service = service;
    }

    @GetMapping
    public List<FloatAdditionDto> list() {
        return service.listForCurrent();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public FloatAdditionDto add(@Valid @RequestBody CreateFloatAdditionRequest req,
                                @AuthenticationPrincipal AppUserDetails principal) {
        return service.add(req, principal.getId());
    }

    @PostMapping("/{id}/void")
    public FloatAdditionDto voidAddition(@PathVariable UUID id,
                                         @RequestBody(required = false) VoidRequest body,
                                         @AuthenticationPrincipal AppUserDetails principal) {
        String reason = body == null ? null : body.reason();
        return service.voidAddition(id, principal.getId(), reason);
    }

    public record VoidRequest(String reason) {}
}
