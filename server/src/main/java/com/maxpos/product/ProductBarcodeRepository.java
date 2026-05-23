package com.maxpos.product;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ProductBarcodeRepository extends JpaRepository<ProductBarcode, UUID> {
    Optional<ProductBarcode> findByCode(String code);
    boolean existsByCode(String code);
}
