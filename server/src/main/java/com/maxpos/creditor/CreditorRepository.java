package com.maxpos.creditor;

import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CreditorRepository extends JpaRepository<Creditor, UUID> {
    List<Creditor> findAllByActiveTrue(Sort sort);
    List<Creditor> findAll(Sort sort);
}
