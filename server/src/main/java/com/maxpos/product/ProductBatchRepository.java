package com.maxpos.product;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface ProductBatchRepository extends JpaRepository<ProductBatch, UUID> {

    /**
     * Return salable batches for a product, ordered FEFO (earliest expiry first;
     * batches without an expiry sort last; received_at breaks ties).
     * Used by SaleService to deplete stock during checkout.
     */
    @Query("""
        SELECT b FROM ProductBatch b
         WHERE b.product.id = :productId
           AND b.writtenOffAt IS NULL
           AND b.quantityRemaining > 0
           AND (b.expiryDate IS NULL OR b.expiryDate >= CURRENT_DATE)
         ORDER BY CASE WHEN b.expiryDate IS NULL THEN 1 ELSE 0 END,
                  b.expiryDate ASC,
                  b.receivedAt ASC
        """)
    List<ProductBatch> findSalableByProductFefo(@Param("productId") UUID productId);

    /** Every batch for a product, newest shipment first (for the admin breakdown view). */
    List<ProductBatch> findAllByProductIdOrderByReceivedAtDesc(UUID productId);

    /**
     * Active batches whose expiry falls on or before the cutoff date (for the
     * notification bell / dashboard alert). Already-expired batches are
     * included — admins still need to know about them to write them off.
     */
    @Query("""
        SELECT b FROM ProductBatch b
         WHERE b.writtenOffAt IS NULL
           AND b.quantityRemaining > 0
           AND b.expiryDate IS NOT NULL
           AND b.expiryDate <= :cutoff
         ORDER BY b.expiryDate ASC
        """)
    List<ProductBatch> findExpiringBy(@Param("cutoff") LocalDate cutoff);
}
