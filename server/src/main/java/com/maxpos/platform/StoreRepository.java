package com.maxpos.platform;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface StoreRepository extends JpaRepository<Store, UUID> {

    Optional<Store> findBySlugIgnoreCase(String slug);
    boolean existsBySlugIgnoreCase(String slug);
}
