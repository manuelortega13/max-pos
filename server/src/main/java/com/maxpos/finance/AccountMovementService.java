package com.maxpos.finance;

import com.maxpos.businessday.BusinessDay;
import com.maxpos.businessday.FloatAddition;
import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.creditor.CreditorPayment;
import com.maxpos.expense.Expense;
import com.maxpos.finance.dto.AccountMovementDto;
import com.maxpos.finance.dto.ManualMovementRequest;
import com.maxpos.finance.dto.TransferRequest;
import com.maxpos.gcash.GcashTransaction;
import com.maxpos.gcash.GcashTransactionType;
import com.maxpos.load.LoadTransaction;
import com.maxpos.sale.PaymentMethod;
import com.maxpos.sale.Sale;
import com.maxpos.settings.StoreSettings;
import com.maxpos.settings.StoreSettingsRepository;
import com.maxpos.user.User;
import com.maxpos.user.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The single write-side entry point for the finance ledger.
 *
 * Every domain service (SaleService, GcashTransactionService, etc.)
 * calls into the {@code recordFor*} methods after persisting a source
 * row, and into {@link #voidMovementsForSource} when a source row is
 * voided. Centralizing the bookkeeping here means call sites stay
 * clean and the mapping rules (payment method → account, fee
 * handling, IN/OUT direction) live in exactly one place.
 *
 * All public methods are idempotent on source: if a movement already
 * exists for {@code (sourceKind, sourceId)} the recorder no-ops and
 * returns. This makes the service safe against double-invocation
 * (e.g., a retried transaction).
 */
@Service
@Transactional(readOnly = true)
public class AccountMovementService {

    private final AccountMovementRepository movements;
    private final AccountRepository accounts;
    private final StoreSettingsRepository settings;
    private final UserRepository users;

    public AccountMovementService(AccountMovementRepository movements,
                                  AccountRepository accounts,
                                  StoreSettingsRepository settings,
                                  UserRepository users) {
        this.movements = movements;
        this.accounts = accounts;
        this.settings = settings;
        this.users = users;
    }

    // ─────────────────────────── Auto-tracking ─────────────────────────

    /**
     * Record the cash/card/transfer/credit movement triggered by a sale.
     * Cash/card/transfer sales hit their mapped account directly; credit
     * sales hit the RECEIVABLES account (the customer now owes the
     * store, and that obligation is an asset). The receivable is paid
     * down later when the matching creditor payment lands — see
     * {@link #recordForCreditorPayment(CreditorPayment)}.
     */
    @Transactional
    public void recordForSale(Sale sale) {
        if (sale == null || sale.getId() == null) return;
        if (movements.existsBySourceKindAndSourceId(MovementSourceKind.SALE, sale.getId())) return;

        Account target = resolveAccountForPaymentMethod(sale.getPaymentMethod());
        if (target == null) return; // unmapped (e.g., card account not configured)

        saveSourceRow(target, MovementDirection.IN,
                sale.getTotal(),
                categoryForSale(sale.getPaymentMethod()),
                noteForSale(sale),
                sale.getDate(), sale.getCashier(),
                MovementSourceKind.SALE, sale.getId());
    }

    /**
     * Record the OUT side when a sale is refunded. Mirrors the sale's
     * original target: cash/card/transfer refunds reverse against the
     * same wallet; credit-sale refunds reverse against RECEIVABLES so
     * the customer's outstanding balance drops by the refunded amount.
     */
    @Transactional
    public void recordForSaleRefund(Sale sale) {
        if (sale == null || sale.getId() == null) return;
        if (movements.existsBySourceKindAndSourceId(MovementSourceKind.REFUND, sale.getId())) return;

        Account target = resolveAccountForPaymentMethod(sale.getPaymentMethod());
        if (target == null) return;

        saveSourceRow(target, MovementDirection.OUT,
                sale.getTotal(),
                categoryForRefund(sale.getPaymentMethod()),
                "Refund of " + sale.getReference(),
                Instant.now(), sale.getCashier(),
                MovementSourceKind.REFUND, sale.getId());
    }

    /**
     * GCash service transaction.
     *
     * Cash-in: customer hands cash, store sends GCash.
     *   Cash       +amount+fee
     *   GCash      -amount
     *
     * Cash-out: customer sends GCash, store hands cash.
     *   Cash       -amount (and +fee as a separate row so the
     *              fee shows up as revenue in the breakdown)
     *   GCash      +amount
     */
    @Transactional
    public void recordForGcashTransaction(GcashTransaction t) {
        if (t == null || t.getId() == null) return;
        if (movements.existsBySourceKindAndSourceId(MovementSourceKind.GCASH_TXN, t.getId())) return;

        Account cash  = requireAccount(AccountKind.CASH);
        Account gcash = requireAccount(AccountKind.GCASH);

        if (t.getType() == GcashTransactionType.CASH_IN) {
            saveSourceRow(cash, MovementDirection.IN,
                    t.getAmount().add(t.getFee()),
                    MovementCategory.GCASH_CASH_IN,
                    "GCash cash-in " + t.getReference(),
                    t.getDate(), t.getCashier(),
                    MovementSourceKind.GCASH_TXN, t.getId());
            saveSourceRow(gcash, MovementDirection.OUT,
                    t.getAmount(),
                    MovementCategory.GCASH_CASH_IN,
                    "GCash cash-in " + t.getReference(),
                    t.getDate(), t.getCashier(),
                    MovementSourceKind.GCASH_TXN, t.getId());
        } else { // CASH_OUT
            saveSourceRow(cash, MovementDirection.OUT,
                    t.getAmount(),
                    MovementCategory.GCASH_CASH_OUT,
                    "GCash cash-out " + t.getReference(),
                    t.getDate(), t.getCashier(),
                    MovementSourceKind.GCASH_TXN, t.getId());
            if (t.getFee() != null && t.getFee().signum() > 0) {
                saveSourceRow(cash, MovementDirection.IN,
                        t.getFee(),
                        MovementCategory.GCASH_FEE,
                        "GCash cash-out fee " + t.getReference(),
                        t.getDate(), t.getCashier(),
                        MovementSourceKind.GCASH_TXN, t.getId());
            }
            saveSourceRow(gcash, MovementDirection.IN,
                    t.getAmount(),
                    MovementCategory.GCASH_CASH_OUT,
                    "GCash cash-out " + t.getReference(),
                    t.getDate(), t.getCashier(),
                    MovementSourceKind.GCASH_TXN, t.getId());
        }
    }

    /**
     * Cellphone load.
     *   Cash         +amount+fee (customer paid for the load + service fee)
     *   Load wallet  -amount     (store's prepaid balance with the carrier)
     */
    @Transactional
    public void recordForLoadTransaction(LoadTransaction t) {
        if (t == null || t.getId() == null) return;
        if (movements.existsBySourceKindAndSourceId(MovementSourceKind.LOAD_TXN, t.getId())) return;

        Account cash       = requireAccount(AccountKind.CASH);
        Account loadWallet = requireAccount(AccountKind.LOAD_WALLET);

        saveSourceRow(cash, MovementDirection.IN,
                t.getAmount().add(t.getFee()),
                MovementCategory.LOAD_SALE,
                "Load " + t.getReference(),
                t.getDate(), t.getCashier(),
                MovementSourceKind.LOAD_TXN, t.getId());

        saveSourceRow(loadWallet, MovementDirection.OUT,
                t.getAmount(),
                MovementCategory.LOAD_SALE,
                "Load " + t.getReference(),
                t.getDate(), t.getCashier(),
                MovementSourceKind.LOAD_TXN, t.getId());
    }

    /**
     * Expense — OUT from the expense's chosen payment account. The
     * category falls back to the generic EXPENSE constant when the
     * expense row's own category is blank; otherwise the expense's
     * own category propagates so admins can group expenses by their
     * categorization on the Finances breakdown panel.
     */
    @Transactional
    public void recordForExpense(Expense expense, Account paymentAccount) {
        if (expense == null || expense.getId() == null || paymentAccount == null) return;
        if (movements.existsBySourceKindAndSourceId(MovementSourceKind.EXPENSE, expense.getId())) return;

        String category = expense.getCategory() == null || expense.getCategory().isBlank()
                ? MovementCategory.EXPENSE
                : expense.getCategory().trim();

        AccountMovement m = new AccountMovement();
        m.setAccount(paymentAccount);
        m.setDirection(MovementDirection.OUT);
        m.setAmount(expense.getAmount());
        m.setCategory(category);
        m.setNote(expense.getDescription());
        m.setOccurredAt(expense.getCreatedAt());
        m.setRecordedBy(expense.getCreatedBy());
        m.setSourceKind(MovementSourceKind.EXPENSE);
        m.setSourceId(expense.getId());
        movements.save(m);
    }

    /**
     * Creditor payment — two paired rows: +IN to cash/card/transfer
     * (cash physically lands in the chosen wallet) and -OUT from
     * Receivables (the outstanding balance drops by the same amount).
     * Both share {@code (sourceKind=CREDITOR_PAYMENT, sourceId)} so the
     * void cascade picks them up together.
     */
    @Transactional
    public void recordForCreditorPayment(CreditorPayment p) {
        if (p == null || p.getId() == null) return;
        if (movements.existsBySourceKindAndSourceId(MovementSourceKind.CREDITOR_PAYMENT, p.getId())) return;

        Account target = resolveAccountForPaymentMethod(p.getPaymentMethod());
        if (target != null) {
            saveSourceRow(target, MovementDirection.IN,
                    p.getAmount(),
                    MovementCategory.CREDIT_PAYMENT,
                    "Credit payment " + p.getReference(),
                    p.getDate(), p.getCashier(),
                    MovementSourceKind.CREDITOR_PAYMENT, p.getId());
        }

        Account receivables = accounts
                .findFirstByKindAndActiveTrueOrderBySortOrderAsc(AccountKind.RECEIVABLES)
                .orElse(null);
        if (receivables != null) {
            saveSourceRow(receivables, MovementDirection.OUT,
                    p.getAmount(),
                    MovementCategory.CREDIT_PAYMENT,
                    "Credit payment " + p.getReference(),
                    p.getDate(), p.getCashier(),
                    MovementSourceKind.CREDITOR_PAYMENT, p.getId());
        }
    }

    /** Mid-day cash float top-up → Cash account. */
    @Transactional
    public void recordForFloatAddition(FloatAddition a) {
        if (a == null || a.getId() == null) return;
        if (movements.existsBySourceKindAndSourceId(MovementSourceKind.FLOAT_ADDITION, a.getId())) return;

        Account cash = requireAccount(AccountKind.CASH);
        AccountMovement m = new AccountMovement();
        m.setAccount(cash);
        m.setDirection(MovementDirection.IN);
        m.setAmount(a.getAmount());
        m.setCategory(MovementCategory.FLOAT_TOPUP);
        m.setNote(a.getNote() != null ? a.getNote() : "Mid-day float top-up");
        m.setOccurredAt(a.getAddedAt());
        m.setRecordedBy(a.getAddedBy());
        m.setSourceKind(MovementSourceKind.FLOAT_ADDITION);
        m.setSourceId(a.getId());
        movements.save(m);
    }

    /** Business-day opening float → Cash account. */
    @Transactional
    public void recordForOpeningFloat(BusinessDay d) {
        if (d == null || d.getId() == null) return;
        if (d.getOpeningFloat() == null || d.getOpeningFloat().signum() <= 0) return;
        if (movements.existsBySourceKindAndSourceId(MovementSourceKind.OPENING_FLOAT, d.getId())) return;

        Account cash = requireAccount(AccountKind.CASH);
        AccountMovement m = new AccountMovement();
        m.setAccount(cash);
        m.setDirection(MovementDirection.IN);
        m.setAmount(d.getOpeningFloat());
        m.setCategory(MovementCategory.OPENING_FLOAT);
        m.setNote("Opening float");
        m.setOccurredAt(d.getOpenedAt());
        m.setRecordedBy(d.getOpenedBy());
        m.setSourceKind(MovementSourceKind.OPENING_FLOAT);
        m.setSourceId(d.getId());
        movements.save(m);
    }

    // ────────────────────────────── Void cascade ───────────────────────

    /**
     * Soft-void every non-voided movement belonging to a source row.
     * Called from each domain service's void path so the ledger stays
     * in sync (a voided sale's IN movement vanishes from balances).
     */
    @Transactional
    public void voidMovementsForSource(MovementSourceKind sourceKind, UUID sourceId, User voider) {
        if (sourceId == null) return;
        Instant now = Instant.now();
        for (AccountMovement m : movements.findAllBySourceKindAndSourceIdAndVoidedAtIsNull(sourceKind, sourceId)) {
            m.setVoidedAt(now);
            m.setVoidedBy(voider);
        }
    }

    // ────────────────────────────── Manual entries ─────────────────────

    @Transactional
    public AccountMovementDto recordManualIn(ManualMovementRequest req, UUID adminId) {
        return recordManual(req, MovementDirection.IN, adminId);
    }

    @Transactional
    public AccountMovementDto recordManualOut(ManualMovementRequest req, UUID adminId) {
        return recordManual(req, MovementDirection.OUT, adminId);
    }

    private AccountMovementDto recordManual(ManualMovementRequest req,
                                            MovementDirection direction,
                                            UUID adminId) {
        Account account = accounts.findById(req.accountId())
                .orElseThrow(() -> new NotFoundException("Account not found"));
        User admin = users.findById(adminId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        AccountMovement m = new AccountMovement();
        m.setAccount(account);
        m.setDirection(direction);
        m.setAmount(req.amount());
        m.setCategory(req.category().trim());
        m.setNote(req.note() == null || req.note().isBlank() ? null : req.note().trim());
        m.setOccurredAt(Instant.now());
        m.setRecordedBy(admin);
        m.setSourceKind(MovementSourceKind.MANUAL);
        return AccountMovementDto.from(movements.save(m));
    }

    /**
     * Transfer between two accounts. Writes two paired rows: an OUT
     * on the source, an IN on the destination, linked via
     * {@link AccountMovement#getTransferPair()} so the UI can show
     * "transferred to X" / "transferred from Y" on either side.
     */
    @Transactional
    public AccountMovementDto recordTransfer(TransferRequest req, UUID adminId) {
        if (req.fromAccountId().equals(req.toAccountId())) {
            throw new ConflictException("Transfer source and destination must differ.");
        }
        Account from = accounts.findById(req.fromAccountId())
                .orElseThrow(() -> new NotFoundException("Source account not found"));
        Account to   = accounts.findById(req.toAccountId())
                .orElseThrow(() -> new NotFoundException("Destination account not found"));
        User admin = users.findById(adminId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        Instant now = Instant.now();
        String trimmedNote = req.note() == null || req.note().isBlank() ? null : req.note().trim();
        String autoNote = "Transfer " + from.getName() + " → " + to.getName();
        String finalNote = trimmedNote == null ? autoNote : autoNote + " · " + trimmedNote;

        AccountMovement outRow = new AccountMovement();
        outRow.setAccount(from);
        outRow.setDirection(MovementDirection.OUT);
        outRow.setAmount(req.amount());
        outRow.setCategory(MovementCategory.TRANSFER);
        outRow.setNote(finalNote);
        outRow.setOccurredAt(now);
        outRow.setRecordedBy(admin);
        outRow.setSourceKind(MovementSourceKind.TRANSFER);
        outRow = movements.save(outRow);

        AccountMovement inRow = new AccountMovement();
        inRow.setAccount(to);
        inRow.setDirection(MovementDirection.IN);
        inRow.setAmount(req.amount());
        inRow.setCategory(MovementCategory.TRANSFER);
        inRow.setNote(finalNote);
        inRow.setOccurredAt(now);
        inRow.setRecordedBy(admin);
        inRow.setSourceKind(MovementSourceKind.TRANSFER);
        inRow.setTransferPair(outRow);
        inRow = movements.save(inRow);

        outRow.setTransferPair(inRow);
        return AccountMovementDto.from(outRow);
    }

    /**
     * Internal helper used by {@link AccountReconciliationService} to
     * write the variance adjustment paired with a reconciliation.
     * Public on this service so reconciliation logic can stay in its
     * own service without exposing repository internals.
     */
    @Transactional
    public AccountMovement recordReconciliationAdjustment(Account account,
                                                          BigDecimal variance,
                                                          User by) {
        if (variance.signum() == 0) return null;
        AccountMovement m = new AccountMovement();
        m.setAccount(account);
        m.setDirection(variance.signum() > 0 ? MovementDirection.IN : MovementDirection.OUT);
        m.setAmount(variance.abs());
        m.setCategory(variance.signum() > 0
                ? MovementCategory.RECONCILE_OVER
                : MovementCategory.RECONCILE_SHORT);
        m.setNote("Reconciliation adjustment");
        m.setOccurredAt(Instant.now());
        m.setRecordedBy(by);
        m.setSourceKind(MovementSourceKind.RECONCILE);
        return movements.save(m);
    }

    // ────────────────────────────── Queries ────────────────────────────

    public List<AccountMovementDto> feed(Instant from, Instant to) {
        return movements.findAllByOccurredAtBetweenOrderByOccurredAtDesc(from, to)
                .stream().map(AccountMovementDto::from).toList();
    }

    public List<AccountMovementDto> feedForAccount(UUID accountId, Instant from, Instant to) {
        return movements.findAllByAccountIdAndOccurredAtBetweenOrderByOccurredAtDesc(accountId, from, to)
                .stream().map(AccountMovementDto::from).toList();
    }

    public BigDecimal balanceFor(UUID accountId) {
        return movements.sumBalanceForAccount(accountId);
    }

    public BigDecimal balanceForAt(UUID accountId, Instant at) {
        return movements.sumBalanceForAccountAt(accountId, at);
    }

    @Transactional
    public AccountMovementDto voidMovement(UUID id, UUID adminId) {
        AccountMovement m = movements.findById(id)
                .orElseThrow(() -> new NotFoundException("Movement not found"));
        if (m.getVoidedAt() != null) {
            throw new ConflictException("Already voided.");
        }
        // Only manual movements + transfers may be voided here.
        // Source-row-derived movements (sales, gcash, etc.) should be
        // voided via their source's void action so the ledger stays in
        // sync with the source's lifecycle.
        if (m.getSourceKind() != MovementSourceKind.MANUAL
                && m.getSourceKind() != MovementSourceKind.TRANSFER) {
            throw new ConflictException(
                    "Source-derived movements must be voided via the source row.");
        }
        User admin = users.findById(adminId)
                .orElseThrow(() -> new NotFoundException("User not found"));
        Instant now = Instant.now();
        m.setVoidedAt(now);
        m.setVoidedBy(admin);
        // Mirror the void to the transfer pair so they always toggle together.
        if (m.getTransferPair() != null && m.getTransferPair().getVoidedAt() == null) {
            m.getTransferPair().setVoidedAt(now);
            m.getTransferPair().setVoidedBy(admin);
        }
        return AccountMovementDto.from(m);
    }

    // ────────────────────────────── Helpers ────────────────────────────

    /** Required-or-throw account lookup by kind. Auto-tracker uses this
     *  for accounts that must exist (CASH, GCASH, LOAD_WALLET). */
    private Account requireAccount(AccountKind kind) {
        return accounts.findFirstByKindAndActiveTrueOrderBySortOrderAsc(kind)
                .orElseThrow(() -> new ConflictException(
                        "No active account of kind " + kind + " exists. " +
                        "Add one in Finances → Accounts."));
    }

    /**
     * Map a sale/payment's PaymentMethod to its target account:
     *   CASH     → Cash account
     *   CARD     → store_settings.card_account_id (admin-configurable)
     *   TRANSFER → store_settings.transfer_account_id (admin-configurable)
     *   CREDIT   → Receivables account (asset booked against the
     *               creditor; settled when {@link
     *               #recordForCreditorPayment(CreditorPayment)} fires)
     *
     * Returns null when no mapping is set — the caller no-ops in
     * that case rather than failing the source operation.
     */
    private Account resolveAccountForPaymentMethod(PaymentMethod method) {
        if (method == null) return null;
        switch (method) {
            case CASH:
                return accounts.findFirstByKindAndActiveTrueOrderBySortOrderAsc(AccountKind.CASH)
                        .orElse(null);
            case CARD: {
                StoreSettings s = settings.findById(1).orElse(null);
                if (s == null || s.getCardAccountId() == null) return null;
                return accounts.findById(s.getCardAccountId()).orElse(null);
            }
            case TRANSFER: {
                StoreSettings s = settings.findById(1).orElse(null);
                if (s == null || s.getTransferAccountId() == null) return null;
                return accounts.findById(s.getTransferAccountId()).orElse(null);
            }
            case CREDIT:
                return accounts.findFirstByKindAndActiveTrueOrderBySortOrderAsc(AccountKind.RECEIVABLES)
                        .orElse(null);
            default:
                return null;
        }
    }

    private String noteForSale(Sale sale) {
        String prefix = sale.getPaymentMethod() == PaymentMethod.CREDIT ? "Credit sale " : "Sale ";
        return prefix + sale.getReference();
    }

    private String categoryForSale(PaymentMethod method) {
        return switch (method) {
            case CASH     -> MovementCategory.CASH_SALE;
            case CARD     -> MovementCategory.CARD_SALE;
            case TRANSFER -> MovementCategory.TRANSFER_SALE;
            case CREDIT   -> MovementCategory.CREDIT_SALE;
        };
    }

    private String categoryForRefund(PaymentMethod method) {
        return switch (method) {
            case CASH     -> MovementCategory.CASH_REFUND;
            case CARD     -> MovementCategory.CARD_REFUND;
            case TRANSFER -> MovementCategory.TRANSFER_REFUND;
            case CREDIT   -> MovementCategory.CREDIT_REFUND;
        };
    }

    private void saveSourceRow(Account account, MovementDirection direction,
                               BigDecimal amount, String category, String note,
                               Instant occurredAt, User recordedBy,
                               MovementSourceKind sourceKind, UUID sourceId) {
        AccountMovement m = new AccountMovement();
        m.setAccount(account);
        m.setDirection(direction);
        m.setAmount(amount);
        m.setCategory(category);
        m.setNote(note);
        m.setOccurredAt(occurredAt);
        m.setRecordedBy(recordedBy);
        m.setSourceKind(sourceKind);
        m.setSourceId(sourceId);
        movements.save(m);
    }

    /** Optional accessor for upstream services that already have an
     *  Account in hand and just need the existence guard. */
    public Optional<Account> findActiveByKind(AccountKind kind) {
        return accounts.findFirstByKindAndActiveTrueOrderBySortOrderAsc(kind);
    }
}
