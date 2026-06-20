package com.maxpos.platform.fx;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

/** FX rates as exposed to the platform console. */
public record FxRatesDto(
        String base,
        Instant asOf,
        boolean available,
        Map<String, BigDecimal> toBase
) {
    public static FxRatesDto from(FxSnapshot s) {
        return new FxRatesDto(s.base(), s.asOf(), s.available(), s.toBase());
    }
}
