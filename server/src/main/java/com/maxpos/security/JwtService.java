package com.maxpos.security;

import com.maxpos.config.MaxPosProperties;
import com.maxpos.platform.PlatformAdmin;
import com.maxpos.user.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;

@Service
public class JwtService {

    private final MaxPosProperties.Jwt props;
    private final SecretKey key;

    public JwtService(MaxPosProperties properties) {
        this.props = properties.jwt();
        this.key = Keys.hmacShaKeyFor(props.secret().getBytes(StandardCharsets.UTF_8));
    }

    /** Token type claim — distinguishes store-user tokens from platform-admin
     *  tokens in the auth filter. Absent (legacy tokens) is treated as STORE. */
    public static final String CLAIM_TYPE = "type";
    public static final String TYPE_STORE = "STORE";
    public static final String TYPE_PLATFORM = "PLATFORM";

    public String issue(User user) {
        return issueStoreToken(user.getId(), user.getEmail(), user.getName(),
                user.getRole().name(), user.getStoreId());
    }

    /**
     * Issue a store-user token from raw fields. Lets callers that resolve a
     * user without a managed JPA entity (e.g. platform impersonation, which
     * reads via JdbcTemplate to avoid the tenant-bound session) mint a token.
     */
    public String issueStoreToken(java.util.UUID userId, String email, String name,
                                  String role, java.util.UUID storeId) {
        Instant now = Instant.now();
        Instant exp = now.plusSeconds(props.ttlMinutes() * 60);
        return Jwts.builder()
                .issuer(props.issuer())
                .subject(userId.toString())
                .claim(CLAIM_TYPE, TYPE_STORE)
                .claim("email", email)
                .claim("name", name)
                .claim("role", role)
                .claim("storeId", storeId.toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(exp))
                .signWith(key)
                .compact();
    }

    /** Issue a platform-admin token. No store / tenant — platform admins
     *  operate above all stores. */
    public String issuePlatform(PlatformAdmin admin) {
        Instant now = Instant.now();
        Instant exp = now.plusSeconds(props.ttlMinutes() * 60);
        return Jwts.builder()
                .issuer(props.issuer())
                .subject(admin.getId().toString())
                .claim(CLAIM_TYPE, TYPE_PLATFORM)
                .claim("email", admin.getEmail())
                .claim("name", admin.getName())
                .issuedAt(Date.from(now))
                .expiration(Date.from(exp))
                .signWith(key)
                .compact();
    }

    public Claims parse(String token) {
        return Jwts.parser()
                .requireIssuer(props.issuer())
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
