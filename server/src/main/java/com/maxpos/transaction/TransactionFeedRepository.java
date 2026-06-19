package com.maxpos.transaction;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface TransactionFeedRepository extends JpaRepository<TransactionFeedRow, UUID> {

    /**
     * One filtered, sorted, paginated page of the unified feed. The
     * source/status/cashier filters are optional — a null argument
     * disables that predicate (those params infer their type from the
     * column they're compared to). {@code term} is different: it lives
     * only inside a {@code like}/{@code concat}, where a null parameter
     * has no column to take its type from, so PgJDBC binds it as
     * {@code bytea} and the query fails with "operator does not exist:
     * text ~~ bytea". To avoid that we never pass null for the term —
     * the caller sends "" to mean "no search", matched here with
     * {@code :term = ''} so the param is always a non-null varchar.
     * {@code term} must be pre-lowercased; it matches reference OR
     * cashier name. The date range is gated by the boolean {@code hasFrom}
     * / {@code hasTo} flags rather than {@code :from is null}: a bare
     * null-check on an Instant parameter leaves Postgres unable to
     * determine its type ("could not determine data type of parameter"),
     * whereas inside the comparison the {@code date} column supplies it.
     * {@code from} is inclusive, {@code to} exclusive. Spring Data derives
     * the {@code count} query.
     */
    @Query("""
            select t from TransactionFeedRow t
            where (:source is null or t.source = :source)
              and (:status is null or t.status = :status)
              and (:cashierId is null or t.cashierId = :cashierId)
              and (:hasFrom = false or t.date >= :from)
              and (:hasTo = false or t.date < :to)
              and (:term = ''
                   or lower(t.reference) like concat('%', :term, '%')
                   or lower(t.cashierName) like concat('%', :term, '%'))
            """)
    Page<TransactionFeedRow> search(@Param("source") String source,
                                    @Param("status") String status,
                                    @Param("cashierId") UUID cashierId,
                                    @Param("hasFrom") boolean hasFrom,
                                    @Param("from") Instant from,
                                    @Param("hasTo") boolean hasTo,
                                    @Param("to") Instant to,
                                    @Param("term") String term,
                                    Pageable pageable);
}
