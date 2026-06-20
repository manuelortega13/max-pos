package com.maxpos.finance;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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

    /**
     * One filtered, sorted, paginated page of the movement feed for the
     * Finances tables. {@code accountId} null = all accounts. The date range
     * is gated by {@code hasFrom}/{@code hasTo} booleans rather than a bare
     * {@code :from is null}: a null-check on an Instant parameter leaves
     * Postgres unable to determine its type, whereas inside the comparison
     * the {@code occurredAt} column supplies it. {@code from} is inclusive,
     * {@code to} exclusive. {@code term} is never null — the caller passes ""
     * for "no search" (matched with {@code :term = ''}), because a null bound
     * into a {@code like}/{@code concat} has no column to take its type from
     * and PgJDBC would bind it as {@code bytea}. {@code term} must be
     * pre-lowercased; it matches the note OR the category. Voided rows are
     * included (the tables show them with a VOID tag). Spring Data derives the
     * count query.
     */
    @Query("""
            select m from AccountMovement m
            where (:accountId is null or m.account.id = :accountId)
              and (:hasFrom = false or m.occurredAt >= :from)
              and (:hasTo = false or m.occurredAt < :to)
              and (:term = ''
                   or lower(m.note) like concat('%', :term, '%')
                   or lower(m.category) like concat('%', :term, '%'))
            """)
    Page<AccountMovement> search(@Param("accountId") UUID accountId,
                                 @Param("hasFrom") boolean hasFrom,
                                 @Param("from") Instant from,
                                 @Param("hasTo") boolean hasTo,
                                 @Param("to") Instant to,
                                 @Param("term") String term,
                                 Pageable pageable);

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
