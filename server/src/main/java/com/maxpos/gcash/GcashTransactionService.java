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
    private final com.maxpos.finance.AccountMovementService accountMovements;

    @PersistenceContext
    private EntityManager em;

    public GcashTransactionService(GcashTransactionRepository transactions,
                                   GcashFeeTierRepository tiers,
                                   BusinessDayRepository businessDays,
                                   UserRepository users,
                                   com.maxpos.finance.AccountMovementService accountMovements) {
        this.transactions = transactions;
        this.tiers = tiers;
        this.businessDays = businessDays;
        this.users = users;
        this.accountMovements = accountMovements;
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
        String inboundRef = req.inboundRef() == null || req.inboundRef().isBlank()
                ? null : req.inboundRef().trim();

        // Type-specific required fields. DB CHECKs back-stop these,
        // but throwing friendly 409s here avoids the bare constraint
        // errors leaking out. Also strip out the field that doesn't
        // belong on this type so a misbehaving client can't sneak
        // cash-in fields onto a cash-out row (or vice versa).
        if (req.type() == GcashTransactionType.CASH_IN) {
            if (phone == null) {
                throw new ConflictException("Customer phone is required for cash-in.");
            }
            inboundRef = null;
        } else {
            if (inboundRef == null) {
                throw new ConflictException("Inbound GCash reference is required for cash-out.");
            }
            name = null;
            phone = null;
        }

        // Tier table is keyed by the principal of the transaction.
        // For cash-in that's req.amount() (the GCash sent to the
        // customer). For cash-out it depends on the cashier's
        // "fee included" toggle:
        //   feeIncluded = true  → customer's GCash send already
        //     contained the fee, so the principal is amount − fee.
        //   feeIncluded = false → customer sent the principal as-is
        //     and the fee comes out of the cash handed back, so the
        //     principal is amount.
        // amount stored on the row is always the literal GCash
        // transferred — only the validation lookup shifts.
        boolean feeBundled =
                req.type() == GcashTransactionType.CASH_OUT
                && Boolean.TRUE.equals(req.feeIncluded());
        BigDecimal lookupAmount = feeBundled
                ? req.amount().subtract(req.fee())
                : req.amount();
        Optional<GcashFeeTier> tier = tiers
                .findFirstByActiveTrueAndMinAmountLessThanEqualAndMaxAmountGreaterThanEqualOrderByMinAmount(
                        lookupAmount, lookupAmount);
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
        t.setInboundRef(inboundRef);
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
        GcashTransaction saved = transactions.save(t);
        // Finance ledger — only post completed rows. Pending cash-ins
        // wait until the admin marks them complete.
        if (saved.getStatus() == GcashTransactionStatus.COMPLETED) {
            accountMovements.recordForGcashTransaction(saved);
        }
        return GcashTransactionDto.from(saved);
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
        // Finance ledger — first time the row counts toward balances.
        accountMovements.recordForGcashTransaction(t);
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
        // Finance ledger — void any associated movements (no-op if
        // this was a pending cash-in that never posted).
        accountMovements.voidMovementsForSource(
                com.maxpos.finance.MovementSourceKind.GCASH_TXN, t.getId(), admin);
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
