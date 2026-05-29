package com.maxpos.creditor;

import com.maxpos.businessday.BusinessDay;
import com.maxpos.businessday.BusinessDayRepository;
import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.creditor.dto.CreateCreditorPaymentRequest;
import com.maxpos.creditor.dto.CreditorPaymentDto;
import com.maxpos.sale.PaymentMethod;
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
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

@Service
@Transactional(readOnly = true)
public class CreditorPaymentService {

    private final CreditorPaymentRepository payments;
    private final CreditorRepository creditors;
    private final BusinessDayRepository businessDays;
    private final UserRepository users;
    private final com.maxpos.finance.AccountMovementService accountMovements;

    @PersistenceContext
    private EntityManager em;

    public CreditorPaymentService(CreditorPaymentRepository payments,
                                  CreditorRepository creditors,
                                  BusinessDayRepository businessDays,
                                  UserRepository users,
                                  com.maxpos.finance.AccountMovementService accountMovements) {
        this.payments = payments;
        this.creditors = creditors;
        this.businessDays = businessDays;
        this.users = users;
        this.accountMovements = accountMovements;
    }

    public List<CreditorPaymentDto> listByCreditor(UUID creditorId) {
        if (!creditors.existsById(creditorId)) {
            throw new NotFoundException("Creditor not found");
        }
        return payments.findAllByCreditorIdOrderByDateDesc(creditorId).stream()
                .map(CreditorPaymentDto::from).toList();
    }

    /** Calling cashier's own payments — drives "My Transactions". */
    public List<CreditorPaymentDto> listByCashier(UUID cashierId) {
        return payments.findAllByCashierIdOrderByDateDesc(cashierId).stream()
                .map(CreditorPaymentDto::from).toList();
    }

    /** Every payment, newest first. Admin-only at the controller. */
    public List<CreditorPaymentDto> listAll() {
        return payments.findAllByOrderByDateDesc().stream()
                .map(CreditorPaymentDto::from).toList();
    }

    /**
     * Record a payment against a creditor's balance. Validates:
     *   - creditor exists and is active
     *   - amount > 0
     *   - amount ≤ current outstanding balance (hard block)
     *   - payment method is CASH, CARD, or TRANSFER (not CREDIT)
     *   - a business day is open
     *
     * Throws ConflictException for any rule violation so the
     * frontend gets a clean 409 with an actionable message.
     */
    @Transactional
    public CreditorPaymentDto create(CreateCreditorPaymentRequest req, UUID cashierId) {
        if (req.paymentMethod() == PaymentMethod.CREDIT) {
            throw new ConflictException("Credit payments cannot be paid with CREDIT.");
        }

        Creditor creditor = creditors.findById(req.creditorId())
                .orElseThrow(() -> new NotFoundException("Creditor not found"));
        if (!creditor.isActive()) {
            throw new ConflictException("Creditor \"" + creditor.getFullName() + "\" is inactive.");
        }

        // The hard-block rule from the plan: paying more than the
        // current balance is rejected outright. Use the @Formula-
        // backed value — it's live and already reflects any voids
        // that happened before this transaction started.
        BigDecimal balance = creditor.getOutstandingBalance() == null
                ? BigDecimal.ZERO
                : creditor.getOutstandingBalance();
        if (req.amount().compareTo(balance) > 0) {
            throw new ConflictException(
                    "Payment of " + req.amount() + " exceeds outstanding balance of " + balance + ".");
        }

        BusinessDay openDay = businessDays.findFirstByClosedAtIsNull().orElseThrow(
                () -> new ConflictException("No business day is open."));

        User cashier = users.findById(cashierId)
                .orElseThrow(() -> new NotFoundException("Cashier not found"));

        CreditorPayment p = new CreditorPayment();
        p.setCreditor(creditor);
        p.setAmount(req.amount());
        p.setPaymentMethod(req.paymentMethod());
        p.setCashier(cashier);
        p.setBusinessDay(openDay);
        p.setDate(Instant.now());
        p.setReference(generateReference());
        p.setNotes(req.notes() == null || req.notes().isBlank() ? null : req.notes().trim());
        CreditorPayment saved = payments.save(p);
        // Finance ledger — IN movement against cash / card / transfer
        // account based on payment method.
        accountMovements.recordForCreditorPayment(saved);
        return CreditorPaymentDto.from(saved);
    }

    /**
     * Soft-void an existing payment. Idempotent rule: re-voiding a
     * already-voided payment returns 409 so the admin sees they
     * can't undo a void from this endpoint.
     */
    @Transactional
    public CreditorPaymentDto voidPayment(UUID paymentId, UUID adminId, String reason) {
        CreditorPayment p = payments.findById(paymentId)
                .orElseThrow(() -> new NotFoundException("Payment not found"));
        if (p.getVoidedAt() != null) {
            throw new ConflictException("Payment is already voided.");
        }
        User admin = users.findById(adminId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        p.setVoidedAt(Instant.now());
        p.setVoidedBy(admin);
        if (reason != null && !reason.isBlank()) {
            // Append the reason to existing notes — keeps an audit trail
            // without needing a separate column for void reason.
            String trimmed = reason.trim();
            String prior = p.getNotes() == null ? "" : p.getNotes() + "\n";
            p.setNotes(prior + "[VOID] " + trimmed);
        }
        // Finance ledger — void the paired IN movement.
        accountMovements.voidMovementsForSource(
                com.maxpos.finance.MovementSourceKind.CREDITOR_PAYMENT, p.getId(), admin);
        em.flush();
        em.refresh(p);
        return CreditorPaymentDto.from(p);
    }

    private String generateReference() {
        String datePart = LocalDate.now(ZoneOffset.UTC).toString().replace("-", "");
        int random = ThreadLocalRandom.current().nextInt(10_000, 99_999);
        return String.format(Locale.ROOT, "P-%s-%d", datePart, random);
    }
}
