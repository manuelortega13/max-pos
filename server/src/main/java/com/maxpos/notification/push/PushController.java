package com.maxpos.notification.push;

import com.maxpos.security.AppUserDetails;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/push")
public class PushController {

    private final PushService pushService;
    private final PushProperties props;

    public PushController(PushService pushService, PushProperties props) {
        this.pushService = pushService;
        this.props = props;
    }

    /** Public — clients need this before asking the browser to subscribe. */
    @GetMapping("/vapid-public-key")
    public Map<String, String> vapidPublicKey() {
        return Map.of("publicKey", props.publicKey() == null ? "" : props.publicKey());
    }

    /** Register a browser's push subscription for the signed-in admin. */
    @PostMapping("/subscribe")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public void subscribe(
            @Valid @RequestBody SubscribeRequest req,
            @AuthenticationPrincipal AppUserDetails principal
    ) {
        pushService.subscribe(principal.getId(), req.endpoint(), req.p256dh(), req.auth());
    }

    @PostMapping("/unsubscribe")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unsubscribe(
            @Valid @RequestBody UnsubscribeRequest req,
            @AuthenticationPrincipal AppUserDetails principal
    ) {
        pushService.unsubscribe(principal.getId(), req.endpoint());
    }

    public record SubscribeRequest(
            @NotBlank String endpoint,
            @NotBlank String p256dh,
            @NotBlank String auth
    ) {}

    public record UnsubscribeRequest(
            @NotBlank String endpoint
    ) {}
}
