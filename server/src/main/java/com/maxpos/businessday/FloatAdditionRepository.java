package com.maxpos.businessday;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface FloatAdditionRepository extends JpaRepository<FloatAddition, UUID> {
    List<FloatAddition> findAllByBusinessDayIdOrderByAddedAtDesc(UUID businessDayId);
    List<FloatAddition> findAllByBusinessDayId(UUID businessDayId);
}
