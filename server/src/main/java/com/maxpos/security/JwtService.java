package com.maxpos.security;

import com.maxpos.config.MaxPosProperties;
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

    public String issue(User user) {
        Instant now = Instant.now();
        Instant exp = now.plusSeconds(props.ttlMinutes() * 60);
        return Jwts.builder()
                .issuer(props.issuer())
                .subject(user.getId().toString())
                .claim("email", user.getEmail())
                .claim("name", user.getName())
                .claim("role", user.getRole().name())
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
