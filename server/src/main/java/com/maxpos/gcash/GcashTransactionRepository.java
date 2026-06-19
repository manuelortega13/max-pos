package com.maxpos.gcash;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GcashTransactionRepository extends JpaRepository<GcashTransaction, UUID> {
    List<GcashTransaction> findAllByCashierIdOrderByDateDesc(UUID cashierId);
    List<GcashTransaction> findAllByBusinessDayId(UUID businessDayId);
    List<GcashTransaction> findAllByOrderByDateDesc();

    /** Offline-replay idempotency lookup — see GcashTransactionService.create. */
    Optional<GcashTransaction> findByClientRef(String clientRef);

    /** Service-fee revenue from completed (non-voided) GCash transactions
     *  in [from, to) — feeds the dashboard profit window and the reports
     *  range summary. */
    @Query("""
            select coalesce(sum(g.fee), 0)
            from GcashTransaction g
            where g.status = com.maxpos.gcash.GcashTransactionStatus.COMPLETED
              and g.voidedAt is null and g.date >= :from and g.date < :to
            """)
    BigDecimal completedFeesBetween(@Param("from") Instant from, @Param("to") Instant to);
}
