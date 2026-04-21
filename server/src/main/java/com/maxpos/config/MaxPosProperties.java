package com.maxpos.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@ConfigurationProperties(prefix = "maxpos")
public record MaxPosProperties(
        @NotNull Jwt jwt,
        @NotNull Cors cors
) {
    public record Jwt(
            @NotBlank String secret,
            @NotBlank String issuer,
            @Positive long ttlMinutes
    ) {}

    public record Cors(
            @NotEmpty List<String> allowedOrigins
    ) {}
}
