package com.maxpos.sale;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SaleRepository extends JpaRepository<Sale, UUID> {
    List<Sale> findAllByCashierIdOrderByDateDesc(UUID cashierId);
    List<Sale> findAllByDateBetweenOrderByDateDesc(Instant start, Instant end);
    List<Sale> findAllByOrderByDateDesc();
    List<Sale> findAllByBusinessDayId(UUID businessDayId);
    /** Drives the Creditor sales-history view in the admin Creditors page. */
    List<Sale> findAllByCreditorIdOrderByDateDesc(UUID creditorId);
    Optional<Sale> findByReference(String reference);

    /** Orphan sales (no business_day_id) whose date falls within a
     *  business day's window. Drives the reopen-day flow's auto re-
     *  attachment of sales that lost their FK link. */
    List<Sale> findAllByBusinessDayIsNullAndDateBetween(Instant start, Instant end);

    /**
     * Completed-sale revenue grouped by UTC calendar day, from {@code start}
     * onward. Backs the dashboard Sales Growth chart so it aggregates in the
     * database instead of shipping every sale to the browser. Returns rows of
     * {@code [day 'YYYY-MM-DD' (String), total (BigDecimal)]}; days with no
     * sales are absent (the service zero-fills the window).
     */
    @Query(value = """
            SELECT to_char((date AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
                   COALESCE(SUM(total), 0) AS total
            FROM sales
            WHERE status = 'COMPLETED' AND date >= :start
            GROUP BY (date AT TIME ZONE 'UTC')::date
            """, nativeQuery = true)
    List<Object[]> dailyCompletedRevenueSince(@Param("start") Instant start);

    /** Completed-sale revenue in [start, end). Backs the dashboard's
     *  "Revenue today" KPI server-side. */
    @Query("""
            select coalesce(sum(s.total), 0)
            from Sale s
            where s.status = com.maxpos.sale.SaleStatus.COMPLETED
              and s.date >= :start and s.date < :end
            """)
    BigDecimal completedRevenueBetween(@Param("start") Instant start, @Param("end") Instant end);

    /** Count of completed sales in [start, end) — the "Transactions today" KPI. */
    @Query("""
            select count(s)
            from Sale s
            where s.status = com.maxpos.sale.SaleStatus.COMPLETED
              and s.date >= :start and s.date < :end
            """)
    long completedCountBetween(@Param("start") Instant start, @Param("end") Instant end);

    /** All-time average completed-sale total — the "Average ticket" KPI
     *  (same scope the tile showed before). Returns 0 when there are none. */
    @Query("""
            select coalesce(avg(s.total), 0)
            from Sale s
            where s.status = com.maxpos.sale.SaleStatus.COMPLETED
            """)
    double averageCompletedTotal();

    /** Cost of goods sold for completed sales since {@code from}: the sum of
     *  unitCost × quantity across their line items. Lines with a null
     *  unitCost (pre-V14 rows) drop out of the sum — treated as zero cost,
     *  matching the dashboard's previous client-side math. */
    @Query("""
            select coalesce(sum(i.unitCost * i.quantity), 0)
            from SaleItem i
            where i.sale.status = com.maxpos.sale.SaleStatus.COMPLETED
              and i.sale.date >= :from
            """)
    BigDecimal completedCogsSince(@Param("from") Instant from);

    /** COGS for completed sales in [from, to) for the Reports page. Unlike
     *  {@link #completedCogsSince}, a null line unitCost (pre-V14 rows)
     *  falls back to the product's current cost — matching the Reports
     *  page's previous client-side math. */
    @Query("""
            select coalesce(sum(coalesce(i.unitCost, i.product.cost) * i.quantity), 0)
            from SaleItem i
            where i.sale.status = com.maxpos.sale.SaleStatus.COMPLETED
              and i.sale.date >= :from and i.sale.date < :to
            """)
    BigDecimal completedCogsBetween(@Param("from") Instant from, @Param("to") Instant to);
}
