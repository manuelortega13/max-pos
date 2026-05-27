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
    Optional<LoadFeeTier> findFirstByActiveTrueAndMinAmountLessThanEqualAndMaxAmountGreaterThanOrderByMinAmount(
            BigDecimal minBound, BigDecimal maxBound);
}
