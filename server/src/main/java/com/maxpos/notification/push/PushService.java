package com.maxpos.notification.push;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxpos.notification.NotificationEvent;
import com.maxpos.notification.NotificationPublisher;
import com.maxpos.notification.PushDeliveryService;
import com.maxpos.user.User;
import com.maxpos.user.UserRepository;
import jakarta.annotation.PostConstruct;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.Subscription;
import org.apache.http.HttpResponse;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.GeneralSecurityException;
import java.security.Security;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class PushService implements PushDeliveryService {
    private static final Logger log = LoggerFactory.getLogger(PushService.class);

    private final PushSubscriptionRepository subscriptions;
    private final UserRepository users;
    private final NotificationPublisher publisher;
    private final PushProperties props;
    private final ObjectMapper mapper = new ObjectMapper();

    private nl.martijndwars.webpush.PushService webPush;

    public PushService(PushSubscriptionRepository subscriptions,
                       UserRepository users,
                       NotificationPublisher publisher,
                       PushProperties props) {
        this.subscriptions = subscriptions;
        this.users = users;
        this.publisher = publisher;
        this.props = props;
    }

    @PostConstruct
    void init() {
        if (!props.isEnabled()) {
            log.warn("VAPID keys not configured — Web Push delivery disabled.");
            return;
        }
        Security.addProvider(new BouncyCastleProvider());
        try {
            webPush = new nl.martijndwars.webpush.PushService(
                    props.publicKey(), props.privateKey(), props.subject());
            log.info("Web Push delivery enabled.");
        } catch (GeneralSecurityException ex) {
            log.error("Failed to init Web Push — VAPID keys invalid?", ex);
        }
        // Register back with the publisher so it fans out to push in addition to SSE.
        publisher.setPushDelivery(this);
    }

    /** Save a new browser subscription for a user (idempotent on endpoint). */
    public PushSubscription subscribe(UUID userId, String endpoint, String p256dh, String auth) {
        User user = users.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));
        Optional<PushSubscription> existing = subscriptions.findByUserIdAndEndpoint(userId, endpoint);
        PushSubscription sub = existing.orElseGet(PushSubscription::new);
        sub.setUser(user);
        sub.setEndpoint(endpoint);
        sub.setP256dh(p256dh);
        sub.setAuth(auth);
        return subscriptions.save(sub);
    }

    public void unsubscribe(UUID userId, String endpoint) {
        subscriptions.deleteByUserIdAndEndpoint(userId, endpoint);
    }

    @Override
    public void deliverToUser(UUID userId, NotificationEvent event) {
        if (webPush == null) return;
        List<PushSubscription> subs = subscriptions.findAllByUserId(userId);
        if (subs.isEmpty()) return;

        String payload;
        try {
            payload = mapper.writeValueAsString(toPayload(event));
        } catch (JsonProcessingException ex) {
            log.warn("Failed to serialize push payload", ex);
            return;
        }

        for (PushSubscription sub : subs) {
            try {
                Subscription subscription = new Subscription(
                        sub.getEndpoint(),
                        new Subscription.Keys(sub.getP256dh(), sub.getAuth())
                );
                Notification notification = new Notification(subscription, payload);
                HttpResponse response = webPush.send(notification);
                int status = response.getStatusLine().getStatusCode();
                if (status == 404 || status == 410) {
                    // Endpoint no longer valid — prune
                    subscriptions.delete(sub);
                } else if (status >= 400) {
                    log.warn("Push delivery failed for {}: HTTP {}", sub.getEndpoint(), status);
                }
            } catch (Exception ex) {
                // webpush-java throws checked exceptions including JoseException
                // from jose4j; swallow them all and log — push failure must
                // never bubble back to whoever triggered the event.
                log.warn("Push delivery error", ex);
                if (ex instanceof InterruptedException) Thread.currentThread().interrupt();
            }
        }
    }

    /**
     * Angular's ngsw-worker auto-displays a push whose JSON payload has a
     * top-level {@code notification} key. Wrap the event in that shape and
     * stash the deep-link URL inside {@code data.url}; the frontend reads it
     * back in PushService's notificationClicks handler to route on tap.
     */
    private Map<String, Object> toPayload(NotificationEvent event) {
        Map<String, Object> data = new HashMap<>(event.data() == null ? Map.of() : event.data());
        if (event.url() != null) {
            data.put("url", event.url());
        }
        Map<String, Object> notification = new HashMap<>();
        notification.put("title", event.title());
        notification.put("body", event.body());
        notification.put("icon", "/icons/icon-192.png");
        notification.put("badge", "/icons/icon-192.png");
        notification.put("tag", event.type());
        notification.put("renotify", Boolean.TRUE);
        notification.put("data", data);
        return Map.of("notification", notification);
    }
}
