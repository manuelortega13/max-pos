package com.maxpos.platform;

import com.maxpos.auth.dto.LoginRequest;
import com.maxpos.platform.dto.PlatformAuthResponse;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Platform-admin authentication, separate from store-user auth. */
@RestController
@RequestMapping("/api/platform/auth")
public class PlatformAuthController {

    private final PlatformAuthService authService;

    public PlatformAuthController(PlatformAuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public PlatformAuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @GetMapping("/me")
    @PreAuthorize("hasRole('PLATFORM_ADMIN')")
    public PlatformAuthResponse.AdminInfo me(@AuthenticationPrincipal PlatformPrincipal principal) {
        return new PlatformAuthResponse.AdminInfo(
                principal.getId(), null, principal.getUsername());
    }
}
