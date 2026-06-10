package com.maxpos.load;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LoadTransactionRepository extends JpaRepository<LoadTransaction, UUID> {
    List<LoadTransaction> findAllByCashierIdOrderByDateDesc(UUID cashierId);
    List<LoadTransaction> findAllByBusinessDayId(UUID businessDayId);
    List<LoadTransaction> findAllByOrderByDateDesc();

    /** Offline-replay idempotency lookup — see LoadTransactionService.create. */
    Optional<LoadTransaction> findByClientRef(String clientRef);
}
