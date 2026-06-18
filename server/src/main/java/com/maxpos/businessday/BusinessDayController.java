package com.maxpos.businessday;

import com.maxpos.businessday.dto.BusinessDayDto;
import com.maxpos.businessday.dto.ClosePreviewDto;
import com.maxpos.businessday.dto.CloseDayRequest;
import com.maxpos.businessday.dto.OpenDayRequest;
import com.maxpos.security.AppUserDetails;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/business-days")
public class BusinessDayController {

    private final BusinessDayService service;

    public BusinessDayController(BusinessDayService service) {
        this.service = service;
    }

    /** Both cashiers and admins need to know if a day is open (POS gating,
     *  toolbar pill). Returns 204 No Content when no day is open so clients
     *  can distinguish "closed" from "not authorized". */
    @GetMapping("/current")
    public ResponseEntity<BusinessDayDto> current() {
        return service.current()
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<BusinessDayDto> list() {
        return service.list();
    }

    /**
     * Dedicated Close Day data: the open day plus its live aggregated
     * totals and expected cash, computed server-side in one call. 204 when
     * no day is open. Replaces the page pulling the whole sales / GCash /
     * load / payment history to aggregate in the browser.
     */
    @GetMapping("/current/preview")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ClosePreviewDto> currentPreview() {
        return service.previewCurrent()
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /** Dedicated business-day history feed for the End-of-Day page. */
    @GetMapping("/history")
    @PreAuthorize("hasRole('ADMIN')")
    public List<BusinessDayDto> history() {
        return service.history();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public BusinessDayDto get(@PathVariable UUID id) {
        return service.get(id);
    }

    /**
     * Open the business day. Any authenticated user can do this so a
     * cashier who finds the day closed at shift start can open it
     * themselves without needing an admin to walk over. Closing
     * remains admin-only (it freezes the snapshot + variance and is
     * the right scope for an explicit manager sign-off).
     */
    @PostMapping("/open")
    @ResponseStatus(HttpStatus.CREATED)
    public BusinessDayDto open(@Valid @RequestBody OpenDayRequest req,
                               @AuthenticationPrincipal AppUserDetails principal) {
        return service.open(req, principal.getId());
    }

    @PostMapping("/close")
    @PreAuthorize("hasRole('ADMIN')")
    public BusinessDayDto close(@Valid @RequestBody CloseDayRequest req,
                                @AuthenticationPrincipal AppUserDetails principal) {
        return service.close(req, principal.getId());
    }

    /**
     * Reopen the most recently closed day. Service-level guards:
     *   - {id} must equal the latest closed day's id
     *   - no other day may currently be open
     *   - the day must be closed (defensive)
     */
    @PostMapping("/{id}/reopen")
    @PreAuthorize("hasRole('ADMIN')")
    public BusinessDayDto reopen(@PathVariable java.util.UUID id,
                                 @AuthenticationPrincipal AppUserDetails principal) {
        return service.reopen(id, principal.getId());
    }
}
