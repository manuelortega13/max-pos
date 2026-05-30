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
     *  rows. Returns {@code 0} when the account has no movements.
     *
     *  Excludes {@code OPENING_FLOAT} and {@code FLOAT_TOPUP} rows —
     *  these are working-capital repositions into the till, not new
     *  funds, so they shouldn't show up in the Finances "Cash"
     *  position. The till-level view of those movements still lives
     *  on the End-of-Day page. */
    @Query("""
        SELECT COALESCE(SUM(CASE WHEN m.direction = com.maxpos.finance.MovementDirection.IN
                                 THEN m.amount ELSE -m.amount END), 0)
          FROM AccountMovement m
         WHERE m.account.id = :accountId
           AND m.voidedAt IS NULL
           AND m.category NOT IN ('OPENING_FLOAT', 'FLOAT_TOPUP')
    """)
    BigDecimal sumBalanceForAccount(@Param("accountId") UUID accountId);

    /** Account balance up to (but not including) a moment in time —
     *  used by the reconciliation flow to compute "expected at the
     *  moment of count". Mirrors the float exclusion in
     *  {@link #sumBalanceForAccount(UUID)} so reconciliation sees
     *  the same number the UI shows. */
    @Query("""
        SELECT COALESCE(SUM(CASE WHEN m.direction = com.maxpos.finance.MovementDirection.IN
                                 THEN m.amount ELSE -m.amount END), 0)
          FROM AccountMovement m
         WHERE m.account.id = :accountId
           AND m.voidedAt IS NULL
           AND m.occurredAt <= :at
           AND m.category NOT IN ('OPENING_FLOAT', 'FLOAT_TOPUP')
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
