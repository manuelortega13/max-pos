package com.maxpos.load;

import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LoadFeeTierRepository extends JpaRepository<LoadFeeTier, UUID> {
    List<LoadFeeTier> findAll(Sort sort);
    List<LoadFeeTier> findAllByActiveTrueOrderByMinAmount();
    /** Active tier matching an amount (min ≤ amount ≤ max — closed
     *  range on both ends). Overlap validation prevents endpoint
     *  conflicts on insert/update. */
    Optional<LoadFeeTier> findFirstByActiveTrueAndMinAmountLessThanEqualAndMaxAmountGreaterThanEqualOrderByMinAmount(
            BigDecimal minBound, BigDecimal maxBound);
}
