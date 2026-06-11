package com.maxpos.backup;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneOffset;

/**
 * Admin-only whole-database backup / restore. Both endpoints are gated to
 * ADMIN; the export carries every row (including password hashes), so it must
 * never be reachable by a cashier.
 */
@RestController
@RequestMapping("/api/admin/backup")
public class BackupController {

    private final BackupService service;

    public BackupController(BackupService service) {
        this.service = service;
    }

    /** Download the full database as a JSON file. */
    @GetMapping(value = "/export", produces = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<String> export() {
        String json = service.exportAll();
        String filename = "maxpos-backup-" + LocalDate.now(ZoneOffset.UTC) + ".json";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.APPLICATION_JSON)
                .body(json);
    }

    /** Replace ALL data with the uploaded backup. Destructive — the client
     *  guards it behind a typed confirmation. Body is the raw backup JSON. */
    @PostMapping(value = "/import", consumes = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public BackupService.RestoreSummary importBackup(@RequestBody String json) {
        return service.restoreAll(json);
    }
}
