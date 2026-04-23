package com.maxpos.notification;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * A single notification pushed to admins.
 *  - type: short stable key (e.g. "cart.item-removed", "sale.refunded")
 *  - title/body: human-readable strings
 *  - data: extra payload for the client (product id, cashier name, etc.)
 *  - url: optional deep-link path for when the notification is clicked
 */
public record NotificationEvent(
        UUID id,
        String type,
        String title,
        String body,
        Map<String, Object> data,
        String url,
        Instant timestamp
) {
    public static NotificationEvent of(String type, String title, String body,
                                       Map<String, Object> data, String url) {
        return new NotificationEvent(
                UUID.randomUUID(),
                type,
                title,
                body,
                data == null ? Map.of() : data,
                url,
                Instant.now()
        );
    }
}
