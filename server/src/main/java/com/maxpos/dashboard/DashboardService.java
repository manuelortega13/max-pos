package com.maxpos.dashboard;

import com.maxpos.dashboard.dto.ProfitSummaryDto;
import com.maxpos.dashboard.dto.ReportSummaryDto;
import com.maxpos.expense.ExpenseRepository;
import com.maxpos.gcash.GcashTransactionRepository;
import com.maxpos.load.LoadTransactionRepository;
import com.maxpos.sale.SaleRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;

/**
 * Cross-domain aggregates for the admin dashboard. Sits above the sale /
 * GCash / load / expense repositories so the dashboard's profit panel can
 * be totalled in the database instead of in the browser.
 */
@Service
@Transactional(readOnly = true)
public class DashboardService {

    /** Largest window we'll aggregate, so a crafted {@code days} can't scan
     *  unbounded history. */
    private static final int MAX_DAYS = 366;

    private final SaleRepository sales;
    private final GcashTransactionRepository gcash;
    private final LoadTransactionRepository load;
    private final ExpenseRepository expenses;

    public DashboardService(SaleRepository sales,
                            GcashTransactionRepository gcash,
                            LoadTransactionRepository load,
                            ExpenseRepository expenses) {
        this.sales = sales;
        this.gcash = gcash;
        this.load = load;
        this.expenses = expenses;
    }

    /**
     * Raw aggregates for the rolling profit window: the last {@code days}
     * (UTC) through today. Revenue/COGS/fees use completed rows; expenses
     * use their calendar date. The client turns these into margin, markup,
     * break-even, etc.
     */
    public ProfitSummaryDto profitSummary(int days) {
        int n = Math.min(Math.max(days, 1), MAX_DAYS);
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        LocalDate fromDate = today.minusDays(n - 1L);
        Instant from = fromDate.atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant now = Instant.now();

        BigDecimal salesRevenue = sales.completedRevenueBetween(from, now);
        long salesCount = sales.completedCountBetween(from, now);
        BigDecimal cogs = sales.completedCogsSince(from);
        BigDecimal serviceFees =
                gcash.completedFeesBetween(from, now).add(load.completedFeesBetween(from, now));
        BigDecimal expenseTotal = expenses.totalSince(fromDate);

        return new ProfitSummaryDto(salesRevenue, cogs, serviceFees, expenseTotal, salesCount, n);
    }

    /**
     * Range aggregates for the Reports page across sales + GCash + load,
     * for [from, to). The expenses figure isn't here — the page already
     * loads its expense list (and totals it) via the expense endpoints.
     */
    public ReportSummaryDto reportSummary(Instant from, Instant to) {
        BigDecimal productRevenue = sales.completedRevenueBetween(from, to);
        BigDecimal cogs = sales.completedCogsBetween(from, to);
        BigDecimal gcashFees = gcash.completedFeesBetween(from, to);
        BigDecimal loadFees = load.completedFeesBetween(from, to);
        long salesCount = sales.completedCountBetween(from, to);
        return new ReportSummaryDto(productRevenue, cogs, gcashFees, loadFees, salesCount);
    }
}
