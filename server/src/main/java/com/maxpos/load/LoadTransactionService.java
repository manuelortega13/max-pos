package com.maxpos.load;

import com.maxpos.businessday.BusinessDay;
import com.maxpos.businessday.BusinessDayRepository;
import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.load.dto.CreateLoadTransactionRequest;
import com.maxpos.load.dto.LoadTransactionDto;
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

    @PersistenceContext
    private EntityManager em;

    public LoadTransactionService(LoadTransactionRepository transactions,
                                  LoadFeeTierRepository tiers,
                                  BusinessDayRepository businessDays,
                                  UserRepository users) {
        this.transactions = transactions;
        this.tiers = tiers;
        this.businessDays = businessDays;
        this.users = users;
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

        Optional<LoadFeeTier> tier = tiers
                .findFirstByActiveTrueAndMinAmountLessThanEqualAndMaxAmountGreaterThanOrderByMinAmount(
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
        em.flush();
        em.refresh(t);
        return LoadTransactionDto.from(t);
    }

    private String generateReference() {
        String datePart = LocalDate.now(ZoneOffset.UTC).toString().replace("-", "");
        int random = ThreadLocalRandom.current().nextInt(10_000, 99_999);
        return String.format(Locale.ROOT, "L-%s-%d", datePart, random);
    }
}
