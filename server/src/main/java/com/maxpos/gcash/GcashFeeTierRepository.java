package com.maxpos.gcash;

import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GcashFeeTierRepository extends JpaRepository<GcashFeeTier, UUID> {
    /** Admin listing — active + inactive, ordered by minAmount. */
    List<GcashFeeTier> findAll(Sort sort);

    /** All active tiers, ordered. Drives the overlap check. */
    List<GcashFeeTier> findAllByActiveTrueOrderByMinAmount();

    /** Active tier matching an amount (min ≤ amount ≤ max — closed
     *  range on both ends, matching how humans read "501–1000").
     *  Multiple matches shouldn't happen — overlap validation on
     *  insert/update keeps the active set non-overlapping, including
     *  endpoint contiguity — but we still pick deterministically by
     *  ordering on minAmount. */
    Optional<GcashFeeTier> findFirstByActiveTrueAndMinAmountLessThanEqualAndMaxAmountGreaterThanEqualOrderByMinAmount(
            BigDecimal minBound, BigDecimal maxBound);
}
