package com.maxpos.businessday;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BusinessDayRepository extends JpaRepository<BusinessDay, UUID> {
    /** The currently-open day, if any. The partial unique index in V16
     *  guarantees at most one row matches. */
    Optional<BusinessDay> findFirstByClosedAtIsNull();

    List<BusinessDay> findAllByOrderByOpenedAtDesc();

    /** Most recently closed day, used as the only valid reopen target.
     *  Returns empty when there are no closed days yet. */
    Optional<BusinessDay> findFirstByClosedAtIsNotNullOrderByClosedAtDesc();
}
