package com.maxpos.platform;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Spring Security principal for a platform admin. Carries the single
 * authority {@code ROLE_PLATFORM_ADMIN}; it is NOT a store user and has no
 * store tenancy.
 */
public class PlatformPrincipal implements UserDetails {

    public static final String ROLE = "ROLE_PLATFORM_ADMIN";

    private final UUID id;
    private final String email;
    private final String passwordHash;
    private final boolean active;

    public PlatformPrincipal(PlatformAdmin admin) {
        this.id = admin.getId();
        this.email = admin.getEmail();
        this.passwordHash = admin.getPasswordHash();
        this.active = admin.isActive();
    }

    public UUID getId() { return id; }

    @Override public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority(ROLE));
    }
    @Override public String getPassword() { return passwordHash; }
    @Override public String getUsername() { return email; }
    @Override public boolean isAccountNonExpired() { return active; }
    @Override public boolean isAccountNonLocked() { return active; }
    @Override public boolean isCredentialsNonExpired() { return active; }
    @Override public boolean isEnabled() { return active; }
}
