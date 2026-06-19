package com.maxpos.expense;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface ExpenseRepository extends JpaRepository<Expense, UUID> {
    List<Expense> findAllByDateBetweenOrderByDateDescCreatedAtDesc(LocalDate from, LocalDate to);
    List<Expense> findAllByOrderByDateDescCreatedAtDesc();

    /** Total expense amount on/after {@code from} — feeds the dashboard
     *  profit window's fixed-cost figure. */
    @Query("select coalesce(sum(e.amount), 0) from Expense e where e.date >= :from")
    BigDecimal totalSince(@Param("from") LocalDate from);
}
