package com.maxpos.signup;

import com.maxpos.auth.dto.AuthResponse;
import com.maxpos.signup.dto.StoreRegistrationRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/** Public store sign-up. */
@RestController
@RequestMapping("/api/stores")
public class StoreRegistrationController {

    private final StoreRegistrationService service;

    public StoreRegistrationController(StoreRegistrationService service) {
        this.service = service;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody StoreRegistrationRequest request) {
        return service.register(request);
    }
}
