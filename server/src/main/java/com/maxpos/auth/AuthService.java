package com.maxpos.auth;

import com.maxpos.auth.dto.AuthResponse;
import com.maxpos.auth.dto.LoginRequest;
import com.maxpos.security.JwtService;
import com.maxpos.tenant.TenantContext;
import com.maxpos.user.User;
import com.maxpos.user.UserRepository;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public AuthResponse login(LoginRequest req) {
        // Login is the tenancy bootstrap: we don't know the user's store
        // until we've found them. Look up across all stores (email is
        // globally unique). The issued token's store is taken from the
        // resolved user, and every later request is tenant-scoped by the
        // JWT filter.
        User user;
        TenantContext.runAsRoot();
        try {
            user = users.findByEmailIgnoreCase(req.email())
                    .orElseThrow(() -> new BadCredentialsException("Invalid credentials"));
        } finally {
            TenantContext.clear();
        }

        if (!user.isActive()) {
            throw new DisabledException("Account is disabled");
        }

        if (!passwordEncoder.matches(req.password(), user.getPasswordHash())) {
            throw new BadCredentialsException("Invalid credentials");
        }

        String token = jwtService.issue(user);
        return new AuthResponse(
                token,
                new AuthResponse.UserInfo(user.getId(), user.getName(), user.getEmail(), user.getRole())
        );
    }
}
