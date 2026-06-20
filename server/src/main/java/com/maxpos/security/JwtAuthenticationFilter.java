package com.maxpos.security;

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

    public JwtAuthenticationFilter(JwtService jwtService, AppUserDetailsService userDetailsService) {
        this.jwtService = jwtService;
        this.userDetailsService = userDetailsService;
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
                    UUID userId = UUID.fromString(claims.getSubject());

                    // Load the user across tenants (by primary key) — at this
                    // point no store is known yet, and User is tenant-scoped.
                    AppUserDetails principal;
                    TenantContext.runAsRoot();
                    try {
                        principal = userDetailsService.loadById(userId);
                    } finally {
                        // Leave root mode; the store is set explicitly below.
                        TenantContext.clear();
                    }

                    if (principal.isEnabled()
                            && SecurityContextHolder.getContext().getAuthentication() == null) {
                        // Scope the rest of the request to the user's store.
                        // Authoritative from the DB, so a token can't spoof it.
                        TenantContext.setStore(principal.getStoreId());
                        var auth = new UsernamePasswordAuthenticationToken(
                                principal, null, principal.getAuthorities());
                        auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                        SecurityContextHolder.getContext().setAuthentication(auth);
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
