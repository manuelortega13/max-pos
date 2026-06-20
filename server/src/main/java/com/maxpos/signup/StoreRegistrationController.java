package com.maxpos.signup;

import com.maxpos.auth.dto.AuthResponse;
import com.maxpos.signup.dto.RegistrationDefaults;
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

    /** Public: the default currency the sign-up form pre-selects. */
    @GetMapping("/register/defaults")
    public RegistrationDefaults defaults() {
        return service.defaults();
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody StoreRegistrationRequest request) {
        return service.register(request);
    }
}
