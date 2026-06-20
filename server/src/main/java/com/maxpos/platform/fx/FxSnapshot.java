package com.maxpos.platform.fx;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

/**
 * A point-in-time set of conversion multipliers into the {@link #base}
 * currency. {@code toBase[X]} = how many units of {@code base} one unit of
 * {@code X} is worth (so {@code amountInBase = amountInX * toBase[X]}).
 *
 * <p>{@code available} is false when rates could not be loaded (provider
 * unreachable and no cache/override) — callers then leave amounts unconverted
 * and the UI flags it.
 */
public record FxSnapshot(
        String base,
        Instant asOf,
        boolean available,
        Map<String, BigDecimal> toBase
) {
    /**
     * Multiplier to convert {@code currency} into the base currency, or null
     * when the currency is unknown to this snapshot. The base currency (and a
     * blank/absent currency, treated as already-in-base) returns {@code 1}.
     */
    public BigDecimal multiplierFor(String currency) {
        if (currency == null || currency.isBlank() || currency.equalsIgnoreCase(base)) {
            return BigDecimal.ONE;
        }
        return toBase.get(currency.toUpperCase());
    }
}
