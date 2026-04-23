package com.maxpos.notification.push;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PushSubscriptionRepository extends JpaRepository<PushSubscription, UUID> {
    List<PushSubscription> findAllByUserId(UUID userId);
    Optional<PushSubscription> findByUserIdAndEndpoint(UUID userId, String endpoint);
    void deleteByUserIdAndEndpoint(UUID userId, String endpoint);
}
