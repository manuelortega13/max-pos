package com.maxpos.gcash;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface GcashTransactionRepository extends JpaRepository<GcashTransaction, UUID> {
    List<GcashTransaction> findAllByCashierIdOrderByDateDesc(UUID cashierId);
    List<GcashTransaction> findAllByBusinessDayId(UUID businessDayId);
    List<GcashTransaction> findAllByOrderByDateDesc();
}
