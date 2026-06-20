package com.maxpos.platform;

import com.maxpos.auth.dto.LoginRequest;
import com.maxpos.platform.dto.PlatformAuthResponse;
import com.maxpos.security.JwtService;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Authenticates platform admins (separate from store-user auth). Issues a
 * platform-typed JWT; {@code platform_admins} is a non-tenant table, so no
 * store context is involved.
 */
@Service
@Transactional(readOnly = true)
public class PlatformAuthService {

    private final PlatformAdminRepository admins;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public PlatformAuthService(PlatformAdminRepository admins,
                               PasswordEncoder passwordEncoder,
                               JwtService jwtService) {
        this.admins = admins;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public PlatformAuthResponse login(LoginRequest req) {
        PlatformAdmin admin = admins.findByEmailIgnoreCase(req.email())
                .orElseThrow(() -> new BadCredentialsException("Invalid credentials"));
        if (!admin.isActive()) {
            throw new DisabledException("Account is disabled");
        }
        if (!passwordEncoder.matches(req.password(), admin.getPasswordHash())) {
            throw new BadCredentialsException("Invalid credentials");
        }
        String token = jwtService.issuePlatform(admin);
        return new PlatformAuthResponse(
                token,
                new PlatformAuthResponse.AdminInfo(admin.getId(), admin.getName(), admin.getEmail()));
    }
}
