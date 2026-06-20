package com.maxpos.security;

import com.maxpos.platform.PlatformAdmin;
import com.maxpos.platform.PlatformAdminRepository;
import com.maxpos.platform.PlatformPrincipal;
import com.maxpos.platform.StoreRepository;
import com.maxpos.platform.StoreStatus;
import com.maxpos.tenant.TenantContext;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String HEADER = "Authorization";
    private static final String PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final AppUserDetailsService userDetailsService;
    private final PlatformAdminRepository platformAdmins;
    private final StoreRepository stores;

    public JwtAuthenticationFilter(JwtService jwtService,
                                   AppUserDetailsService userDetailsService,
                                   PlatformAdminRepository platformAdmins,
                                   StoreRepository stores) {
        this.jwtService = jwtService;
        this.userDetailsService = userDetailsService;
        this.platformAdmins = platformAdmins;
        this.stores = stores;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        // Always clear the tenant context at the end so a pooled request
        // thread never carries one store's tenant into the next request.
        try {
            String header = request.getHeader(HEADER);
            if (header != null && header.startsWith(PREFIX)) {
                String token = header.substring(PREFIX.length()).trim();
                try {
                    Claims claims = jwtService.parse(token);
                    UUID subjectId = UUID.fromString(claims.getSubject());
                    String type = claims.get(JwtService.CLAIM_TYPE, String.class);

                    if (JwtService.TYPE_PLATFORM.equals(type)) {
                        // Platform admin: no store tenant is set, so the
                        // context stays NONE (fail-closed) — a platform token
                        // hitting a store endpoint sees nothing. platform_admins
                        // is a non-tenant table, so this load isn't scoped.
                        PlatformAdmin admin = platformAdmins.findById(subjectId).orElse(null);
                        if (admin != null && admin.isActive()
                                && SecurityContextHolder.getContext().getAuthentication() == null) {
                            var principal = new PlatformPrincipal(admin);
                            var auth = new UsernamePasswordAuthenticationToken(
                                    principal, null, principal.getAuthorities());
                            auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                            SecurityContextHolder.getContext().setAuthentication(auth);
                        }
                    } else {
                        // Store user. Load across tenants (by primary key) — at
                        // this point no store is known yet, and User is scoped.
                        // Also read the store's status (non-tenant table) to cut
                        // off sessions of a store that's been suspended.
                        AppUserDetails principal;
                        boolean storeActive;
                        TenantContext.runAsRoot();
                        try {
                            principal = userDetailsService.loadById(subjectId);
                            storeActive = stores.findById(principal.getStoreId())
                                    .map(s -> s.getStatus() == StoreStatus.ACTIVE)
                                    .orElse(false);
                        } finally {
                            // Leave root mode; the store is set explicitly below.
                            TenantContext.clear();
                        }

                        if (principal.isEnabled() && storeActive
                                && SecurityContextHolder.getContext().getAuthentication() == null) {
                            // Scope the rest of the request to the user's store.
                            // Authoritative from the DB, so a token can't spoof it.
                            TenantContext.setStore(principal.getStoreId());
                            var auth = new UsernamePasswordAuthenticationToken(
                                    principal, null, principal.getAuthorities());
                            auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                            SecurityContextHolder.getContext().setAuthentication(auth);
                        }
                    }
                } catch (JwtException | IllegalArgumentException ex) {
                    // Invalid/expired token — stay unauthenticated and untenanted.
                    SecurityContextHolder.clearContext();
                    TenantContext.clear();
                }
            }

            chain.doFilter(request, response);
        } finally {
            TenantContext.clear();
        }
    }
}
