package com.maxpos.product;

import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProductRepository extends JpaRepository<Product, UUID> {
    Optional<Product> findBySkuIgnoreCase(String sku);
    Optional<Product> findByBarcode(String barcode);
    List<Product> findAllByActiveTrue(Sort sort);
    List<Product> findAllByCategoryId(UUID categoryId, Sort sort);
    boolean existsBySkuIgnoreCase(String sku);
    boolean existsByBarcode(String barcode);
}
