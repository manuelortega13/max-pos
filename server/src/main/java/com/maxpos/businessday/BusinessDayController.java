package com.maxpos.businessday;

import com.maxpos.businessday.dto.BusinessDayDto;
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

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public BusinessDayDto get(@PathVariable UUID id) {
        return service.get(id);
    }

    @PostMapping("/open")
    @PreAuthorize("hasRole('ADMIN')")
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
}
