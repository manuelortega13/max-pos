package com.maxpos.platform.fx;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Map;

/**
 * Foreign-exchange settings. The platform console converts each store's
 * revenue (kept in that store's own currency) into the platform currency
 * for the cross-store total, using live rates fetched from {@link #url}.
 *
 * <p>{@code url} is a template: {@code {base}} is replaced with the platform
 * currency code and {@code {key}} with {@link #apiKey} (for providers that
 * need one). The default provider needs no key.
 *
 * <p>{@code staticRates} is an optional manual override (currency code →
 * units of that currency per 1 unit of the base). When non-empty it is used
 * instead of the HTTP fetch — handy for air-gapped deployments or when no FX
 * provider is configured.
 */
@ConfigurationProperties(prefix = "maxpos.fx")
public record FxProperties(
        Boolean enabled,
        String url,
        String apiKey,
        Long ttlMinutes,
        Map<String, Double> staticRates
) {
    private static final String DEFAULT_URL = "https://open.er-api.com/v6/latest/{base}";

    public boolean isEnabled() {
        return enabled == null || enabled;
    }

    public String urlOrDefault() {
        return (url == null || url.isBlank()) ? DEFAULT_URL : url;
    }

    public long ttlMinutesOrDefault() {
        return (ttlMinutes == null || ttlMinutes <= 0) ? 60 : ttlMinutes;
    }

    public String apiKeyOrEmpty() {
        return apiKey == null ? "" : apiKey;
    }

    public Map<String, Double> staticRatesOrEmpty() {
        return staticRates == null ? Map.of() : staticRates;
    }
}
