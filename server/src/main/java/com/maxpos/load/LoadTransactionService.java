package com.maxpos.load;

import com.maxpos.businessday.BusinessDay;
import com.maxpos.businessday.BusinessDayRepository;
import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.creditor.Creditor;
import com.maxpos.creditor.CreditorRepository;
import com.maxpos.load.dto.CreateLoadTransactionRequest;
import com.maxpos.load.dto.LoadTransactionDto;
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
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

@Service
@Transactional(readOnly = true)
public class LoadTransactionService {

    private final LoadTransactionRepository transactions;
    private final LoadFeeTierRepository tiers;
    private final BusinessDayRepository businessDays;
    private final UserRepository users;
    private final CreditorRepository creditors;
    private final com.maxpos.finance.AccountMovementService accountMovements;

    @PersistenceContext
    private EntityManager em;

    public LoadTransactionService(LoadTransactionRepository transactions,
                                  LoadFeeTierRepository tiers,
                                  BusinessDayRepository businessDays,
                                  UserRepository users,
                                  CreditorRepository creditors,
                                  com.maxpos.finance.AccountMovementService accountMovements) {
        this.transactions = transactions;
        this.tiers = tiers;
        this.businessDays = businessDays;
        this.users = users;
        this.creditors = creditors;
        this.accountMovements = accountMovements;
    }

    public List<LoadTransactionDto> listByCashier(UUID cashierId) {
        return transactions.findAllByCashierIdOrderByDateDesc(cashierId).stream()
                .map(LoadTransactionDto::from).toList();
    }

    public List<LoadTransactionDto> listAll() {
        return transactions.findAllByOrderByDateDesc().stream()
                .map(LoadTransactionDto::from).toList();
    }

    /**
     * Record a load transaction. Same shape as GCash cash-in:
     * an open day is required, the fee must match the tier when one
     * applies, otherwise the cashier-supplied fee passes through.
     * Phone is the destination number — required by the DTO + DB.
     */
    @Transactional
    public LoadTransactionDto create(CreateLoadTransactionRequest req, UUID cashierId) {
        BusinessDay openDay = businessDays.findFirstByClosedAtIsNull().orElseThrow(
                () -> new ConflictException("No business day is open."));

        User cashier = users.findById(cashierId)
                .orElseThrow(() -> new NotFoundException("Cashier not found"));

        String phone = req.customerPhone().trim();
        if (phone.isEmpty()) {
            throw new ConflictException("Customer phone is required for load transactions.");
        }
        String promo = req.promo() == null || req.promo().isBlank() ? null : req.promo().trim();

        // CASH (the default) or CREDIT only — loads never settle by
        // card/transfer. Resolve the creditor with the same
        // CREDIT ↔ creditorId symmetry the V26 check constraint enforces.
        PaymentMethod method = req.paymentMethod() == null ? PaymentMethod.CASH : req.paymentMethod();
        if (method != PaymentMethod.CASH && method != PaymentMethod.CREDIT) {
            throw new ConflictException("Loads can only be paid by cash or credit.");
        }
        Creditor creditor = resolveCreditor(method, req.creditorId());

        Optional<LoadFeeTier> tier = tiers
                .findFirstByActiveTrueAndMinAmountLessThanEqualAndMaxAmountGreaterThanEqualOrderByMinAmount(
                        req.amount(), req.amount());
        if (tier.isPresent() && req.fee().compareTo(tier.get().getFee()) != 0) {
            throw new ConflictException(
                    "Fee " + req.fee() + " doesn't match the configured tier (" +
                    tier.get().getFee() + " for " + tier.get().getMinAmount() + "–" +
                    tier.get().getMaxAmount() + ").");
        }

        LoadTransaction t = new LoadTransaction();
        t.setAmount(req.amount());
        t.setFee(req.fee());
        t.setPromo(promo);
        t.setCustomerPhone(phone);
        t.setPaymentMethod(method);
        t.setCreditor(creditor);
        t.setCashier(cashier);
        t.setBusinessDay(openDay);
        t.setDate(Instant.now());
        t.setReference(generateReference());
        t.setNotes(req.notes() == null || req.notes().isBlank() ? null : req.notes().trim());
        // Load lifecycle always starts PENDING — cash is at the till,
        // admin still has to send from their phone.
        t.setStatus(LoadTransactionStatus.PENDING);
        return LoadTransactionDto.from(transactions.save(t));
    }

    /** Admin marks a PENDING load as COMPLETED. One-way. */
    @Transactional
    public LoadTransactionDto complete(UUID id, UUID adminId) {
        LoadTransaction t = transactions.findById(id)
                .orElseThrow(() -> new NotFoundException("Load transaction not found"));
        if (t.getVoidedAt() != null) {
            throw new ConflictException("Cannot complete a voided transaction.");
        }
        if (t.getStatus() == LoadTransactionStatus.COMPLETED) {
            throw new ConflictException("Transaction is already completed.");
        }
        User admin = users.findById(adminId)
                .orElseThrow(() -> new NotFoundException("User not found"));
        t.setStatus(LoadTransactionStatus.COMPLETED);
        t.setCompletedAt(Instant.now());
        t.setCompletedBy(admin);
        // Finance ledger — only post once the admin has actually sent
        // the load (mirrors the GCash cash-in lifecycle).
        accountMovements.recordForLoadTransaction(t);
        return LoadTransactionDto.from(t);
    }

    /** Admin soft-void. */
    @Transactional
    public LoadTransactionDto voidTransaction(UUID id, UUID adminId, String reason) {
        LoadTransaction t = transactions.findById(id)
                .orElseThrow(() -> new NotFoundException("Load transaction not found"));
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
        // Finance ledger — void any associated movements (no-op when
        // the row was still pending and never posted).
        accountMovements.voidMovementsForSource(
                com.maxpos.finance.MovementSourceKind.LOAD_TXN, t.getId(), admin);
        em.flush();
        em.refresh(t);
        return LoadTransactionDto.from(t);
    }

    /**
     * Enforce the "payment method ↔ creditor" symmetry from the V26
     * schema check, mirroring {@code SaleService.resolveCreditor}.
     * Throws a clean 409 instead of a bare DataIntegrityViolation 500.
     */
    private Creditor resolveCreditor(PaymentMethod method, UUID creditorId) {
        boolean isCredit = method == PaymentMethod.CREDIT;
        if (isCredit && creditorId == null) {
            throw new ConflictException("Credit loads require a creditor.");
        }
        if (!isCredit && creditorId != null) {
            throw new ConflictException("Only credit loads can be linked to a creditor.");
        }
        if (creditorId == null) return null;
        Creditor c = creditors.findById(creditorId)
                .orElseThrow(() -> new NotFoundException("Creditor not found"));
        if (!c.isActive()) {
            throw new ConflictException("Creditor \"" + c.getFullName() + "\" is inactive.");
        }
        return c;
    }

    private String generateReference() {
        String datePart = LocalDate.now(ZoneOffset.UTC).toString().replace("-", "");
        int random = ThreadLocalRandom.current().nextInt(10_000, 99_999);
        return String.format(Locale.ROOT, "L-%s-%d", datePart, random);
    }
}
