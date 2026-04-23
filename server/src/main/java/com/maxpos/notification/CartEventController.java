package com.maxpos.notification;

import com.maxpos.security.AppUserDetails;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Cashier pings this when they remove / decrement / clear cart items so that
 * admins get notified in real time. Any authenticated user can post.
 */
@RestController
@RequestMapping("/api/cart-events")
public class CartEventController {

    private final NotificationPublisher publisher;

    public CartEventController(NotificationPublisher publisher) {
        this.publisher = publisher;
    }

    @PostMapping("/removed")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void itemRemoved(
            @Valid @RequestBody CartItemRemovedRequest req,
            @AuthenticationPrincipal AppUserDetails principal
    ) {
        String cashierName = principal.getUsername();
        String action = req.action();

        String title;
        String body;
        switch (action) {
            case "DECREMENT":
                title = "Cart item decremented";
                body = String.format("%s decreased %s to %d", cashierName, req.productName(), req.remainingQty());
                break;
            case "CLEAR":
                title = "Cart cleared";
                body = String.format("%s cleared the cart", cashierName);
                break;
            case "REMOVE":
            default:
                title = "Cart item removed";
                body = String.format("%s removed %s (qty %d)",
                        cashierName, req.productName(), req.previousQty());
                break;
        }

        publisher.publishToAdmins(NotificationEvent.of(
                "cart." + action.toLowerCase(),
                title,
                body,
                Map.of(
                        "cashierId", principal.getId(),
                        "cashierName", cashierName,
                        "productId", req.productId(),
                        "productName", req.productName(),
                        "previousQty", req.previousQty(),
                        "remainingQty", req.remainingQty(),
                        "action", action
                ),
                "/admin/sales"
        ));
    }

    public record CartItemRemovedRequest(
            @NotBlank String productId,
            @NotBlank String productName,
            @Positive int previousQty,
            int remainingQty,
            @NotNull @NotBlank String action
    ) {}
}
