package com.maxpos.load;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LoadTransactionRepository extends JpaRepository<LoadTransaction, UUID> {
    List<LoadTransaction> findAllByCashierIdOrderByDateDesc(UUID cashierId);
    List<LoadTransaction> findAllByBusinessDayId(UUID businessDayId);
    List<LoadTransaction> findAllByOrderByDateDesc();

    /** Offline-replay idempotency lookup — see LoadTransactionService.create. */
    Optional<LoadTransaction> findByClientRef(String clientRef);

    /** Service-fee revenue from completed (non-voided) load transactions
     *  in [from, to) — feeds the dashboard profit window and the reports
     *  range summary. */
    @Query("""
            select coalesce(sum(l.fee), 0)
            from LoadTransaction l
            where l.status = com.maxpos.load.LoadTransactionStatus.COMPLETED
              and l.voidedAt is null and l.date >= :from and l.date < :to
            """)
    BigDecimal completedFeesBetween(@Param("from") Instant from, @Param("to") Instant to);
}
