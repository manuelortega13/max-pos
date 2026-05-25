package com.maxpos.creditor;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CreditorPaymentRepository extends JpaRepository<CreditorPayment, UUID> {
    List<CreditorPayment> findAllByCreditorIdOrderByDateDesc(UUID creditorId);
    List<CreditorPayment> findAllByBusinessDayId(UUID businessDayId);
    /** Cashier's own payments — drives the "My Transactions" view. */
    List<CreditorPayment> findAllByCashierIdOrderByDateDesc(UUID cashierId);
    /** All payments, newest first — drives the admin End-of-Day live preview. */
    List<CreditorPayment> findAllByOrderByDateDesc();
}
