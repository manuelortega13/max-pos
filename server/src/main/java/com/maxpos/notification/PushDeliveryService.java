package com.maxpos.notification;

import java.util.UUID;

/**
 * Delegate for Web Push delivery; bean is provided by Phase C's PushService.
 * Kept as an interface so the NotificationPublisher can depend on "something
 * that delivers pushes to a user" without knowing the cryptography details.
 */
public interface PushDeliveryService {
    void deliverToUser(UUID userId, NotificationEvent event);
}
