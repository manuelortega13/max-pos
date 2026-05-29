package com.maxpos.finance;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AccountReconciliationRepository extends JpaRepository<AccountReconciliation, UUID> {
    List<AccountReconciliation> findAllByAccountIdOrderByCountedAtDesc(UUID accountId);

    /** Most recent (non-voided) reconciliation for an account. Used
     *  to anchor the "since last reconciliation" period summaries on
     *  the Finances page. */
    Optional<AccountReconciliation> findFirstByAccountIdAndVoidedAtIsNullOrderByCountedAtDesc(UUID accountId);
}
