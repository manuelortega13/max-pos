package com.maxpos.notification.push;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * VAPID configuration. If `publicKey`/`privateKey` are blank the PushService
 * logs a warning and disables itself — SSE still works.
 */
@ConfigurationProperties(prefix = "maxpos.push")
public record PushProperties(
        String publicKey,
        String privateKey,
        String subject
) {
    public boolean isEnabled() {
        return publicKey != null && !publicKey.isBlank()
                && privateKey != null && !privateKey.isBlank();
    }
}
