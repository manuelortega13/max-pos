package com.maxpos.platform.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface PlatformAuditRepository extends JpaRepository<PlatformAuditEntry, UUID> {
    Page<PlatformAuditEntry> findAllByOrderByAtDesc(Pageable pageable);
}
