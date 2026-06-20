package com.maxpos.platform.fx;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Fetches and caches foreign-exchange rates for the platform console.
 *
 * <p>Rates are fetched per base currency from the configured provider and
 * cached in memory for {@link FxProperties#ttlMinutesOrDefault()} minutes.
 * The fetch is resilient: on failure we serve the last good snapshot if we
 * have one, otherwise an {@code available=false} snapshot so callers can fall
 * back to unconverted amounts rather than erroring the whole page.
 */
@Service
public class FxRateService {

    private static final Logger log = LoggerFactory.getLogger(FxRateService.class);
    private static final int SCALE = 10;

    private final FxProperties props;
    private final RestClient http = RestClient.create();
    private final Map<String, FxSnapshot> cache = new ConcurrentHashMap<>();

    public FxRateService(FxProperties props) {
        this.props = props;
    }

    /** Current snapshot for {@code base}, fetching/refreshing if the cache is stale. */
    public FxSnapshot snapshot(String base) {
        String b = (base == null || base.isBlank()) ? "USD" : base.trim().toUpperCase();
        FxSnapshot cached = cache.get(b);
        long ttlSeconds = props.ttlMinutesOrDefault() * 60;
        if (cached != null && cached.asOf().isAfter(Instant.now().minusSeconds(ttlSeconds))) {
            return cached;
        }
        FxSnapshot fresh = load(b);
        if (fresh.available()) {
            cache.put(b, fresh);
            return fresh;
        }
        // Fetch failed — keep serving the last good snapshot if we have one.
        return cached != null ? cached : fresh;
    }

    private FxSnapshot load(String base) {
        // Manual override / air-gapped deployments.
        if (!props.staticRatesOrEmpty().isEmpty()) {
            return toSnapshot(base, props.staticRatesOrEmpty(), true);
        }
        if (!props.isEnabled()) {
            return new FxSnapshot(base, Instant.now(), false, Map.of());
        }
        try {
            String url = props.urlOrDefault()
                    .replace("{base}", base)
                    .replace("{key}", props.apiKeyOrEmpty());
            FxApiResponse resp = http.get().uri(url).retrieve().body(FxApiResponse.class);
            if (resp == null || resp.rates() == null || resp.rates().isEmpty()) {
                log.warn("FX provider returned no rates for base {}", base);
                return new FxSnapshot(base, Instant.now(), false, Map.of());
            }
            return toSnapshot(base, resp.rates(), true);
        } catch (Exception e) {
            log.warn("FX rate fetch failed for base {}: {}", base, e.toString());
            return new FxSnapshot(base, Instant.now(), false, Map.of());
        }
    }

    /** Convert a provider map (currency → units per 1 base) into to-base multipliers. */
    private FxSnapshot toSnapshot(String base, Map<String, ? extends Number> unitsPerBase,
                                  boolean available) {
        Map<String, BigDecimal> toBase = new HashMap<>();
        toBase.put(base, BigDecimal.ONE);
        for (Map.Entry<String, ? extends Number> e : unitsPerBase.entrySet()) {
            if (e.getKey() == null || e.getValue() == null) continue;
            double units = e.getValue().doubleValue();
            if (units > 0) {
                toBase.put(e.getKey().toUpperCase(),
                        BigDecimal.ONE.divide(BigDecimal.valueOf(units), SCALE, RoundingMode.HALF_UP));
            }
        }
        return new FxSnapshot(base, Instant.now(), available, Map.copyOf(toBase));
    }

    /** Minimal view of the provider response — both exchangerate.host and
     *  open.er-api.com expose a {@code rates} object keyed by currency code. */
    private record FxApiResponse(Map<String, Double> rates) {}
}
