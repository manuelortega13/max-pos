package com.maxpos.backup;

import com.maxpos.settings.StoreSettingsRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Runs the daily on-disk backup when the store has auto-backup enabled.
 *
 * Fires hourly rather than once at a fixed time so a server that's down at the
 * chosen minute (or restarts mid-day) still backs up — {@link BackupService}
 * itself is idempotent for the day (it no-ops if today's file already exists).
 */
@Component
public class BackupScheduler {

    private static final Logger log = LoggerFactory.getLogger(BackupScheduler.class);

    private final BackupService backupService;
    private final StoreSettingsRepository settings;

    public BackupScheduler(BackupService backupService, StoreSettingsRepository settings) {
        this.backupService = backupService;
        this.settings = settings;
    }

    /** Top of every hour. */
    @Scheduled(cron = "0 0 * * * *")
    public void hourlyTick() {
        boolean enabled = settings.findById(1)
                .map(s -> s.isAutoBackupEnabled())
                .orElse(false);
        if (!enabled) return;
        try {
            backupService.runAutoBackupIfDue();
        } catch (Exception e) {
            // Never let a backup failure kill the scheduler thread — log and
            // retry on the next tick.
            log.warn("Scheduled auto-backup failed: {}", e.getMessage());
        }
    }
}
