package com.maxpos.notification;

import com.maxpos.security.AppUserDetails;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationPublisher publisher;

    public NotificationController(NotificationPublisher publisher) {
        this.publisher = publisher;
    }

    /**
     * SSE stream open to every authenticated user. The publisher decides which
     * events reach which role — cashiers only see broadcast (inventory.*)
     * events, admins additionally see admin-only alerts (cart removals, refund
     * pings). Clients reconnect when the emitter times out.
     */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@AuthenticationPrincipal AppUserDetails principal) {
        return publisher.register(principal.getId(), principal.getRole());
    }
}
