package com.maxpos.health;

import java.time.Instant;

public record HealthResponse(String status, String db, Instant timestamp) {
}
