package com.maxpos.finance;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AccountRepository extends JpaRepository<Account, UUID> {
    List<Account> findAllByOrderBySortOrderAscNameAsc();
    List<Account> findAllByActiveTrueOrderBySortOrderAscNameAsc();

    /** Look up an account by kind. Used by the auto-tracker which
     *  doesn't know the renameable display name. Returns the first
     *  active account of that kind — there should be exactly one
     *  CASH and one LOAD_WALLET; multiple of GCASH/MAYA/BANK are
     *  possible if the admin has subdivided them. */
    Optional<Account> findFirstByKindAndActiveTrueOrderBySortOrderAsc(AccountKind kind);
}
