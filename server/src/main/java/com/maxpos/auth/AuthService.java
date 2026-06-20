package com.maxpos.auth;

import com.maxpos.auth.dto.AuthResponse;
import com.maxpos.auth.dto.LoginRequest;
import com.maxpos.platform.StoreRepository;
import com.maxpos.platform.StoreStatus;
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
    private final StoreRepository stores;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(UserRepository users, StoreRepository stores,
                       PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.users = users;
        this.stores = stores;
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
        StoreStatus storeStatus;
        TenantContext.runAsRoot();
        try {
            user = users.findByEmailIgnoreCase(req.email())
                    .orElseThrow(() -> new BadCredentialsException("Invalid credentials"));
            // stores is a non-tenant table; readable here regardless.
            storeStatus = stores.findById(user.getStoreId())
                    .map(s -> s.getStatus())
                    .orElse(null);
        } finally {
            TenantContext.clear();
        }

        if (!user.isActive()) {
            throw new DisabledException("Account is disabled");
        }

        if (!passwordEncoder.matches(req.password(), user.getPasswordHash())) {
            throw new BadCredentialsException("Invalid credentials");
        }

        // Checked after the password so a suspended store isn't revealed to
        // someone who doesn't have valid credentials anyway.
        if (storeStatus == StoreStatus.SUSPENDED) {
            throw new DisabledException("This store is suspended. Contact the platform administrator.");
        }

        String token = jwtService.issue(user);
        return new AuthResponse(
                token,
                new AuthResponse.UserInfo(user.getId(), user.getName(), user.getEmail(), user.getRole())
        );
    }
}
