package com.maxpos.sale;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SaleRepository extends JpaRepository<Sale, UUID> {
    List<Sale> findAllByCashierIdOrderByDateDesc(UUID cashierId);
    List<Sale> findAllByDateBetweenOrderByDateDesc(Instant start, Instant end);
    List<Sale> findAllByOrderByDateDesc();
    List<Sale> findAllByBusinessDayId(UUID businessDayId);
    /** Drives the Creditor sales-history view in the admin Creditors page. */
    List<Sale> findAllByCreditorIdOrderByDateDesc(UUID creditorId);
    Optional<Sale> findByReference(String reference);
}
