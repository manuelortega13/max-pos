package com.maxpos.sale;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface SaleRepository extends JpaRepository<Sale, UUID> {
    List<Sale> findAllByCashierIdOrderByDateDesc(UUID cashierId);
    List<Sale> findAllByDateBetweenOrderByDateDesc(Instant start, Instant end);
    List<Sale> findAllByOrderByDateDesc();
}
