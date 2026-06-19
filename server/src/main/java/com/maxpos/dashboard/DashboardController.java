package com.maxpos.dashboard;

import com.maxpos.common.ConflictException;
import com.maxpos.dashboard.dto.ProfitSummaryDto;
import com.maxpos.dashboard.dto.ReportSummaryDto;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

/** Admin dashboard aggregates that span multiple domains. */
@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final DashboardService service;

    public DashboardController(DashboardService service) {
        this.service = service;
    }

    /** Raw aggregates for the rolling profit-insights window. Admin-only. */
    @GetMapping("/profit-summary")
    @PreAuthorize("hasRole('ADMIN')")
    public ProfitSummaryDto profitSummary(@RequestParam(defaultValue = "30") int days) {
        return service.profitSummary(days);
    }

    /** Range aggregates (sales + GCash + load) for the Reports page.
     *  {@code from}/{@code to} are ISO-8601 instants; {@code to} is
     *  exclusive. Admin-only. */
    @GetMapping("/report-summary")
    @PreAuthorize("hasRole('ADMIN')")
    public ReportSummaryDto reportSummary(@RequestParam String from, @RequestParam String to) {
        return service.reportSummary(parseInstant(from), parseInstant(to));
    }

    private static Instant parseInstant(String value) {
        try {
            return Instant.parse(value);
        } catch (Exception e) {
            throw new ConflictException("Invalid date: " + value);
        }
    }
}
