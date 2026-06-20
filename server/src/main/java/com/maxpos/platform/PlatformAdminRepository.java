package com.maxpos.platform;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlatformAdminRepository extends JpaRepository<PlatformAdmin, UUID> {
    Optional<PlatformAdmin> findByEmailIgnoreCase(String email);
    boolean existsByEmailIgnoreCase(String email);
    List<PlatformAdmin> findAllByOrderByCreatedAtAsc();
    long countByActiveTrue();
}
