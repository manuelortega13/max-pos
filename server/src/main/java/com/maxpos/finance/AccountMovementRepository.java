package com.maxpos.finance;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface AccountMovementRepository extends JpaRepository<AccountMovement, UUID> {

    /** Per-account balance: sum of IN minus sum of OUT for non-voided
     *  rows. Returns {@code 0} when the account has no movements. */
    @Query("""
        SELECT COALESCE(SUM(CASE WHEN m.direction = com.maxpos.finance.MovementDirection.IN
                                 THEN m.amount ELSE -m.amount END), 0)
          FROM AccountMovement m
         WHERE m.account.id = :accountId
           AND m.voidedAt IS NULL
    """)
    BigDecimal sumBalanceForAccount(@Param("accountId") UUID accountId);

    /** Account balance up to (but not including) a moment in time —
     *  used by the reconciliation flow to compute "expected at the
     *  moment of count". */
    @Query("""
        SELECT COALESCE(SUM(CASE WHEN m.direction = com.maxpos.finance.MovementDirection.IN
                                 THEN m.amount ELSE -m.amount END), 0)
          FROM AccountMovement m
         WHERE m.account.id = :accountId
           AND m.voidedAt IS NULL
           AND m.occurredAt <= :at
    """)
    BigDecimal sumBalanceForAccountAt(@Param("accountId") UUID accountId,
                                      @Param("at") Instant at);

    /** Movement feed — paged/filtered queries the controller composes. */
    List<AccountMovement> findAllByAccountIdAndOccurredAtBetweenOrderByOccurredAtDesc(
            UUID accountId, Instant from, Instant to);

    List<AccountMovement> findAllByOccurredAtBetweenOrderByOccurredAtDesc(
            Instant from, Instant to);

    /** Source-row lookup — used when a source event is voided so we
     *  can cascade-void its movement rows. Returns non-voided rows
     *  only (no point voiding rows that are already voided). */
    List<AccountMovement> findAllBySourceKindAndSourceIdAndVoidedAtIsNull(
            MovementSourceKind sourceKind, UUID sourceId);

    /** Idempotency check: has a movement already been recorded for
     *  this source row? Auto-tracker calls this before inserting to
     *  guard against retries / duplicate work. */
    boolean existsBySourceKindAndSourceId(MovementSourceKind sourceKind, UUID sourceId);
}
