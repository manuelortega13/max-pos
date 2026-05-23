package com.maxpos.product;

import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProductRepository extends JpaRepository<Product, UUID> {
    Optional<Product> findBySkuIgnoreCase(String sku);
    List<Product> findAllByActiveTrue(Sort sort);
    List<Product> findAllByCategoryId(UUID categoryId, Sort sort);
    boolean existsBySkuIgnoreCase(String sku);

    /** Scan-code lookup. Joins through product_barcodes since codes
     *  no longer live on the products table itself. */
    @Query("SELECT b.product FROM ProductBarcode b WHERE b.code = :code")
    Optional<Product> findByBarcode(@Param("code") String code);
}
