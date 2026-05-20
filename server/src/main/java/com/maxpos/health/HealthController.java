package com.maxpos.health;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.Connection;
import java.time.Instant;

@RestController
@RequestMapping("/api/health")
public class HealthController {

    private final DataSource dataSource;

    public HealthController(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @GetMapping
    public ResponseEntity<HealthResponse> health() {
        String dbStatus = pingDatabase();
        boolean up = "UP".equals(dbStatus);
        HealthResponse body = new HealthResponse(
                up ? "UP" : "DOWN",
                dbStatus,
                Instant.now()
        );
        return up ? ResponseEntity.ok(body) : ResponseEntity.status(503).body(body);
    }

    private String pingDatabase() {
        try (Connection conn = dataSource.getConnection()) {
            return conn.isValid(1) ? "UP" : "DOWN";
        } catch (Exception e) {
            return "DOWN";
        }
    }
}
