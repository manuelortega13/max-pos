package com.maxpos.auth;

import com.maxpos.auth.dto.AuthResponse;
import com.maxpos.auth.dto.LoginRequest;
import com.maxpos.security.AppUserDetails;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @GetMapping("/me")
    public AuthResponse.UserInfo me(@AuthenticationPrincipal AppUserDetails principal) {
        return new AuthResponse.UserInfo(
                principal.getId(),
                // name isn't on UserDetails — re-issue tokens include it. For /me you'd normally
                // fetch from the repo. Keeping it simple: this endpoint returns id/email/role.
                null,
                principal.getUsername(),
                com.maxpos.user.UserRole.valueOf(
                        principal.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "")
                )
        );
    }
}
