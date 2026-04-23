package com.maxpos.notification;

import com.maxpos.user.User;
import com.maxpos.user.UserRepository;
import com.maxpos.user.UserRole;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Predicate;

/**
 * In-memory fan-out of NotificationEvents to connected clients. Each connected
 * browser tab holds its own SseEmitter tagged with the user's role so that
 * admin-only events (cart removals, refund alerts) stay out of cashier UIs,
 * while system-wide sync events (inventory.changed) reach everyone.
 *
 * Intentionally not persisted — these events are ephemeral "ping me now"
 * alerts. Persistent history could live in a notifications table later.
 */
@Service
public class NotificationPublisher {
    private static final Logger log = LoggerFactory.getLogger(NotificationPublisher.class);

    /** Long-lived emitter timeout; clients reconnect when it expires. */
    private static final long SSE_TIMEOUT_MS = 60L * 60 * 1000; // 1 hour

    private final UserRepository users;
    private final CopyOnWriteArrayList<Connection> connections = new CopyOnWriteArrayList<>();

    // Push delivery is optional — wired in Phase C. Kept behind Optional so
    // Phase B works before the bean exists.
    private PushDeliveryService pushDelivery;

    public NotificationPublisher(UserRepository users) {
        this.users = users;
    }

    /** Called by Spring after the optional PushDeliveryService bean is created. */
    public void setPushDelivery(PushDeliveryService pushDelivery) {
        this.pushDelivery = pushDelivery;
    }

    /** Register a new SSE stream for the given user. */
    public SseEmitter register(UUID userId, UserRole role) {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        Connection conn = new Connection(userId, role, emitter);
        connections.add(conn);

        emitter.onCompletion(() -> connections.remove(conn));
        emitter.onTimeout(() -> connections.remove(conn));
        emitter.onError((ex) -> connections.remove(conn));

        try {
            emitter.send(SseEmitter.event().name("ready").data("connected"));
        } catch (IOException ex) {
            connections.remove(conn);
        }
        return emitter;
    }

    /**
     * Admin-only: cart removals, refund alerts, anything managers care about.
     * Delivered via SSE to connected admins and optionally via web push for
     * non-silent types.
     */
    public void publishToAdmins(NotificationEvent event) {
        afterCommit(() -> {
            log.debug("Publishing admin notification {} ({})", event.type(), event.title());
            fanOut(event, c -> c.role() == UserRole.ADMIN);

            if (pushDelivery != null && !isSilent(event.type())) {
                List<User> admins = users.findAllByRole(UserRole.ADMIN);
                for (User admin : admins) {
                    pushDelivery.deliverToUser(admin.getId(), event);
                }
            }
        });
    }

    /**
     * Broadcast to every connected user (admins and cashiers). Used for
     * silent data-sync pings (inventory.changed) so every open tab refreshes
     * its product list. Not routed through web push — these are UI sync
     * events, not user-facing alerts.
     */
    public void publishToAll(NotificationEvent event) {
        afterCommit(() -> {
            log.debug("Broadcasting notification {} ({})", event.type(), event.title());
            fanOut(event, c -> true);
        });
    }

    /**
     * Delay fan-out until after the enclosing DB transaction commits. Without
     * this, services that call publish* inside an @Transactional method would
     * race the commit — clients that receive the SSE event and turn around to
     * GET fresh data can out-run Postgres's fsync on localhost, reading the
     * pre-transaction snapshot and rendering stale stock. Outside any active
     * transaction (e.g. unit tests, cron jobs), we fire immediately.
     */
    private void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
    }

    /** Convenience for pushing a silent inventory-sync ping to every client. */
    public void publishInventoryChanged() {
        publishToAll(NotificationEvent.of(
                "inventory.changed",
                "Inventory changed",
                "",
                Map.of(),
                null
        ));
    }

    private void fanOut(NotificationEvent event, Predicate<Connection> filter) {
        for (Connection conn : connections) {
            if (!filter.test(conn)) continue;
            try {
                conn.emitter().send(SseEmitter.event()
                        .id(event.id().toString())
                        .name(event.type())
                        .data(event));
            } catch (IOException ex) {
                connections.remove(conn);
            }
        }
    }

    private static boolean isSilent(String type) {
        return type != null && type.startsWith("inventory.");
    }

    private record Connection(UUID userId, UserRole role, SseEmitter emitter) {}
}
