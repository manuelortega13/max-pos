package com.maxpos.subscription;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Suspends stores whose free trial has lapsed without subscribing to a paid
 * plan. Runs hourly (rather than once a day) so a server that's down at a fixed
 * minute still catches up; {@link SubscriptionService#suspendExpiredTrials()}
 * is idempotent — already-suspended stores no longer match.
 */
@Component
public class TrialExpiryScheduler {

    private final SubscriptionService service;

    public TrialExpiryScheduler(SubscriptionService service) {
        this.service = service;
    }

    /** 15 minutes past every hour. */
    @Scheduled(cron = "0 15 * * * *")
    public void tick() {
        service.suspendExpiredTrials();
    }
}
