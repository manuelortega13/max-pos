package com.maxpos.platform.plan;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlanRepository extends JpaRepository<Plan, UUID> {
    List<Plan> findAllByOrderBySortOrderAscNameAsc();
    List<Plan> findByActiveTrueOrderBySortOrderAscNameAsc();
    boolean existsByCodeIgnoreCase(String code);
    Optional<Plan> findByCodeIgnoreCase(String code);
}
