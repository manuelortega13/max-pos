package com.maxpos.finance;

import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.finance.dto.AccountDto;
import com.maxpos.finance.dto.AccountSummaryDto;
import com.maxpos.finance.dto.AccountUpsertRequest;
import com.maxpos.finance.dto.FinanceOverviewDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * CRUD over {@link Account} + the assembly of {@link AccountSummaryDto}
 * rows and the {@link FinanceOverviewDto} headline. Separated from
 * {@link AccountMovementService} so that service can stay focused on
 * write-side bookkeeping; this one owns the read-side aggregations.
 */
@Service
@Transactional(readOnly = true)
public class AccountService {

    private final AccountRepository accounts;
    private final AccountMovementRepository movements;
    private final AccountReconciliationRepository reconciliations;

    public AccountService(AccountRepository accounts,
                          AccountMovementRepository movements,
                          AccountReconciliationRepository reconciliations) {
        this.accounts = accounts;
        this.movements = movements;
        this.reconciliations = reconciliations;
    }

    public List<AccountDto> list() {
        return accounts.findAllByOrderBySortOrderAscNameAsc().stream()
                .map(AccountDto::from).toList();
    }

    public AccountDto get(UUID id) {
        return accounts.findById(id).map(AccountDto::from)
                .orElseThrow(() -> new NotFoundException("Account not found"));
    }

    @Transactional
    public AccountDto create(AccountUpsertRequest req) {
        if (accounts.findAllByOrderBySortOrderAscNameAsc().stream()
                .anyMatch(a -> a.getName().equalsIgnoreCase(req.name().trim()))) {
            throw new ConflictException("An account with that name already exists.");
        }
        Account a = new Account();
        apply(a, req);
        return AccountDto.from(accounts.save(a));
    }

    @Transactional
    public AccountDto update(UUID id, AccountUpsertRequest req) {
        Account a = accounts.findById(id)
                .orElseThrow(() -> new NotFoundException("Account not found"));
        // Detect rename collisions excluding self.
        boolean nameClash = accounts.findAllByOrderBySortOrderAscNameAsc().stream()
                .anyMatch(other -> !other.getId().equals(id)
                        && other.getName().equalsIgnoreCase(req.name().trim()));
        if (nameClash) throw new ConflictException("An account with that name already exists.");
        apply(a, req);
        return AccountDto.from(a);
    }

    /**
     * Headline overview — net total + per-account summaries + the
     * rolling-30-day in/out totals shown at the top of the Finances
     * page.
     */
    public FinanceOverviewDto overview() {
        List<Account> all = accounts.findAllByOrderBySortOrderAscNameAsc();
        List<AccountSummaryDto> summaries = new ArrayList<>(all.size());
        BigDecimal net = BigDecimal.ZERO;
        for (Account a : all) {
            AccountSummaryDto s = summaryFor(a);
            summaries.add(s);
            if (a.isActive()) net = net.add(s.balance());
        }

        // 30-day rolling pulse — gross all-account totals. Per-account
        // since-last-reconciliation deltas live on each AccountSummaryDto.
        Instant now = Instant.now();
        Instant thirtyDaysAgo = now.minus(30, ChronoUnit.DAYS);
        BigDecimal periodIn = BigDecimal.ZERO;
        BigDecimal periodOut = BigDecimal.ZERO;
        for (AccountMovement m : movements.findAllByOccurredAtBetweenOrderByOccurredAtDesc(thirtyDaysAgo, now)) {
            if (m.getVoidedAt() != null) continue;
            // Skip TRANSFER rows from the headline period sum — they
            // net to zero across accounts and would inflate both
            // sides of the gross in/out display without meaning.
            if (m.getSourceKind() == MovementSourceKind.TRANSFER) continue;
            if (m.getDirection() == MovementDirection.IN) {
                periodIn = periodIn.add(m.getAmount());
            } else {
                periodOut = periodOut.add(m.getAmount());
            }
        }
        return new FinanceOverviewDto(net, summaries, periodIn, periodOut);
    }

    /** Single-account summary — pulls balance + last reconciliation
     *  + since-last-reconciliation period totals. */
    public AccountSummaryDto summaryFor(Account a) {
        BigDecimal balance = movements.sumBalanceForAccount(a.getId());

        Optional<AccountReconciliation> last =
                reconciliations.findFirstByAccountIdAndVoidedAtIsNullOrderByCountedAtDesc(a.getId());
        Instant lastAt = last.map(AccountReconciliation::getCountedAt).orElse(null);
        BigDecimal lastVariance = last.map(AccountReconciliation::getVariance).orElse(null);

        BigDecimal periodIn = BigDecimal.ZERO;
        BigDecimal periodOut = BigDecimal.ZERO;
        Instant since = lastAt != null ? lastAt : Instant.EPOCH;
        for (AccountMovement m : movements.findAllByAccountIdAndOccurredAtBetweenOrderByOccurredAtDesc(
                a.getId(), since, Instant.now())) {
            if (m.getVoidedAt() != null) continue;
            if (m.getSourceKind() == MovementSourceKind.TRANSFER) continue;
            if (m.getDirection() == MovementDirection.IN) {
                periodIn = periodIn.add(m.getAmount());
            } else {
                periodOut = periodOut.add(m.getAmount());
            }
        }
        return new AccountSummaryDto(a.getId(), a.getName(), a.getKind(), a.isActive(),
                a.getSortOrder(), balance, periodIn, periodOut, lastAt, lastVariance);
    }

    private void apply(Account a, AccountUpsertRequest req) {
        a.setName(req.name().trim());
        a.setKind(req.kind());
        a.setActive(req.active());
        a.setSortOrder(req.sortOrder());
    }
}
