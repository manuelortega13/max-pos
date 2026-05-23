package com.maxpos.sale;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/**
 * Read-side accessor for line items. SaleItems are otherwise managed
 * cascade-from-Sale and never queried independently — this exists for
 * the "is this product referenced by any historical sale?" check that
 * gates hard-deleting a product.
 */
public interface SaleItemRepository extends JpaRepository<SaleItem, UUID> {
    boolean existsByProductId(UUID productId);
}
