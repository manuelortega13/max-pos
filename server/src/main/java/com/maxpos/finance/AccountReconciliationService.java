package com.maxpos.finance;

import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.finance.dto.ReconcileRequest;
import com.maxpos.finance.dto.ReconciliationDto;
import com.maxpos.user.User;
import com.maxpos.user.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Count-and-confirm operations on accounts. Reconciliation is
 * non-destructive: it writes a record of what was counted and the
 * variance, then asks {@link AccountMovementService} to write the
 * paired adjustment row so the running balance picks the counted
 * number going forward.
 */
@Service
@Transactional(readOnly = true)
public class AccountReconciliationService {

    private final AccountReconciliationRepository reconciliations;
    private final AccountRepository accounts;
    private final AccountMovementRepository movements;
    private final AccountMovementService movementService;
    private final UserRepository users;

    @PersistenceContext
    private EntityManager em;

    public AccountReconciliationService(AccountReconciliationRepository reconciliations,
                                        AccountRepository accounts,
                                        AccountMovementRepository movements,
                                        AccountMovementService movementService,
                                        UserRepository users) {
        this.reconciliations = reconciliations;
        this.accounts = accounts;
        this.movements = movements;
        this.movementService = movementService;
        this.users = users;
    }

    public List<ReconciliationDto> listForAccount(UUID accountId) {
        return reconciliations.findAllByAccountIdOrderByCountedAtDesc(accountId)
                .stream().map(ReconciliationDto::from).toList();
    }

    /**
     * Record a count-and-confirm event:
     *   - Snapshot the current expected balance.
     *   - Compute variance = counted − expected.
     *   - If variance ≠ 0, create an adjustment movement (IN if over,
     *     OUT if short) so the running balance now matches counted.
     *   - Persist the reconciliation row linked to the adjustment.
     */
    @Transactional
    public ReconciliationDto reconcile(ReconcileRequest req, UUID adminId) {
        Account account = accounts.findById(req.accountId())
                .orElseThrow(() -> new NotFoundException("Account not found"));
        if (!account.isActive()) {
            throw new ConflictException("Cannot reconcile an inactive account.");
        }
        User admin = users.findById(adminId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        BigDecimal expected = movements.sumBalanceForAccount(account.getId());
        BigDecimal variance = req.countedAmount().subtract(expected);

        AccountMovement adjustment =
                movementService.recordReconciliationAdjustment(account, variance, admin);

        AccountReconciliation r = new AccountReconciliation();
        r.setAccount(account);
        r.setCountedAt(Instant.now());
        r.setCountedBy(admin);
        r.setExpectedAmount(expected);
        r.setCountedAmount(req.countedAmount());
        r.setVariance(variance);
        r.setNote(req.note() == null || req.note().isBlank() ? null : req.note().trim());
        r.setAdjustmentMovement(adjustment);
        return ReconciliationDto.from(reconciliations.save(r));
    }

    /**
     * Void a reconciliation. Also voids the paired adjustment
     * movement so the running balance reverts to what it was before
     * the count. Useful when an admin reconciles in error and
     * doesn't want the variance to stick.
     */
    @Transactional
    public ReconciliationDto voidReconciliation(UUID id, UUID adminId) {
        AccountReconciliation r = reconciliations.findById(id)
                .orElseThrow(() -> new NotFoundException("Reconciliation not found"));
        if (r.getVoidedAt() != null) {
            throw new ConflictException("Already voided.");
        }
        User admin = users.findById(adminId)
                .orElseThrow(() -> new NotFoundException("User not found"));
        Instant now = Instant.now();
        r.setVoidedAt(now);
        r.setVoidedBy(admin);
        if (r.getAdjustmentMovement() != null && r.getAdjustmentMovement().getVoidedAt() == null) {
            r.getAdjustmentMovement().setVoidedAt(now);
            r.getAdjustmentMovement().setVoidedBy(admin);
        }
        em.flush();
        em.refresh(r);
        return ReconciliationDto.from(r);
    }
}
