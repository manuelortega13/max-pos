package com.maxpos.gcash;

import com.maxpos.businessday.BusinessDay;
import com.maxpos.businessday.BusinessDayRepository;
import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.gcash.dto.CreateGcashTransactionRequest;
import com.maxpos.gcash.dto.GcashTransactionDto;
import com.maxpos.user.User;
import com.maxpos.user.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

@Service
@Transactional(readOnly = true)
public class GcashTransactionService {

    private final GcashTransactionRepository transactions;
    private final GcashFeeTierRepository tiers;
    private final BusinessDayRepository businessDays;
    private final UserRepository users;

    @PersistenceContext
    private EntityManager em;

    public GcashTransactionService(GcashTransactionRepository transactions,
                                   GcashFeeTierRepository tiers,
                                   BusinessDayRepository businessDays,
                                   UserRepository users) {
        this.transactions = transactions;
        this.tiers = tiers;
        this.businessDays = businessDays;
        this.users = users;
    }

    public List<GcashTransactionDto> listByCashier(UUID cashierId) {
        return transactions.findAllByCashierIdOrderByDateDesc(cashierId).stream()
                .map(GcashTransactionDto::from).toList();
    }

    public List<GcashTransactionDto> listAll() {
        return transactions.findAllByOrderByDateDesc().stream()
                .map(GcashTransactionDto::from).toList();
    }

    /**
     * Record a GCash transaction. Validates an open day is required
     * (cashier shouldn't be transacting before the day opens), then
     * checks the proposed fee against the configured tier table:
     * if the amount matches an active tier, server enforces
     * {@code fee == tier.fee} so the cashier UI can't undercut the
     * admin's schedule. If no tier matches, the cashier's fee
     * passes through (the "manual entry" path).
     */
    @Transactional
    public GcashTransactionDto create(CreateGcashTransactionRequest req, UUID cashierId) {
        BusinessDay openDay = businessDays.findFirstByClosedAtIsNull().orElseThrow(
                () -> new ConflictException("No business day is open."));

        User cashier = users.findById(cashierId)
                .orElseThrow(() -> new NotFoundException("Cashier not found"));

        String name = req.customerName() == null || req.customerName().isBlank()
                ? null : req.customerName().trim();
        String phone = req.customerPhone() == null || req.customerPhone().isBlank()
                ? null : req.customerPhone().trim();
        // Cash-in needs a destination GCash number — the cashier
        // sends to the customer's phone. The DB CHECK enforces this
        // too, but throwing a friendly 409 here avoids the bare
        // constraint error from leaking out.
        if (req.type() == GcashTransactionType.CASH_IN && phone == null) {
            throw new ConflictException("Customer phone is required for cash-in.");
        }

        Optional<GcashFeeTier> tier = tiers
                .findFirstByActiveTrueAndMinAmountLessThanEqualAndMaxAmountGreaterThanOrderByMinAmount(
                        req.amount(), req.amount());
        if (tier.isPresent() && req.fee().compareTo(tier.get().getFee()) != 0) {
            // The cashier UI auto-fills + locks the fee when a tier
            // matches, so this 409 only fires for misbehaving clients.
            throw new ConflictException(
                    "Fee " + req.fee() + " doesn't match the configured tier (" +
                    tier.get().getFee() + " for " + tier.get().getMinAmount() + "–" +
                    tier.get().getMaxAmount() + ").");
        }

        GcashTransaction t = new GcashTransaction();
        t.setType(req.type());
        t.setAmount(req.amount());
        t.setFee(req.fee());
        t.setCustomerName(name);
        t.setCustomerPhone(phone);
        t.setCashier(cashier);
        t.setBusinessDay(openDay);
        t.setDate(Instant.now());
        t.setReference(generateReference());
        t.setNotes(req.notes() == null || req.notes().isBlank() ? null : req.notes().trim());
        // Workflow defaults: cash-in starts PENDING (admin must send
        // the GCash from their phone, then mark it complete). Cash-out
        // is COMPLETED on create — the cashier verifies the inbound
        // GCash before handing cash, so it's finalized at the till.
        if (req.type() == GcashTransactionType.CASH_OUT) {
            t.setStatus(GcashTransactionStatus.COMPLETED);
            t.setCompletedAt(t.getDate());
            t.setCompletedBy(cashier);
        } else {
            t.setStatus(GcashTransactionStatus.PENDING);
        }
        return GcashTransactionDto.from(transactions.save(t));
    }

    /**
     * Admin marks a PENDING cash-in as COMPLETED after sending the
     * GCash from their phone. One-way transition — to undo, void
     * the row and re-record.
     */
    @Transactional
    public GcashTransactionDto complete(UUID id, UUID adminId) {
        GcashTransaction t = transactions.findById(id)
                .orElseThrow(() -> new NotFoundException("GCash transaction not found"));
        if (t.getVoidedAt() != null) {
            throw new ConflictException("Cannot complete a voided transaction.");
        }
        if (t.getStatus() == GcashTransactionStatus.COMPLETED) {
            throw new ConflictException("Transaction is already completed.");
        }
        User admin = users.findById(adminId)
                .orElseThrow(() -> new NotFoundException("User not found"));
        t.setStatus(GcashTransactionStatus.COMPLETED);
        t.setCompletedAt(Instant.now());
        t.setCompletedBy(admin);
        return GcashTransactionDto.from(t);
    }

    /** Admin soft-void. Mirrors CreditorPayment.voidPayment. */
    @Transactional
    public GcashTransactionDto voidTransaction(UUID id, UUID adminId, String reason) {
        GcashTransaction t = transactions.findById(id)
                .orElseThrow(() -> new NotFoundException("GCash transaction not found"));
        if (t.getVoidedAt() != null) {
            throw new ConflictException("Transaction is already voided.");
        }
        User admin = users.findById(adminId)
                .orElseThrow(() -> new NotFoundException("User not found"));
        t.setVoidedAt(Instant.now());
        t.setVoidedBy(admin);
        if (reason != null && !reason.isBlank()) {
            String trimmed = reason.trim();
            String prior = t.getNotes() == null ? "" : t.getNotes() + "\n";
            t.setNotes(prior + "[VOID] " + trimmed);
        }
        em.flush();
        em.refresh(t);
        return GcashTransactionDto.from(t);
    }

    private String generateReference() {
        String datePart = LocalDate.now(ZoneOffset.UTC).toString().replace("-", "");
        int random = ThreadLocalRandom.current().nextInt(10_000, 99_999);
        return String.format(Locale.ROOT, "G-%s-%d", datePart, random);
    }
}
