package com.maxpos.finance;

import com.maxpos.common.PageResponse;
import com.maxpos.finance.dto.AccountDto;
import com.maxpos.finance.dto.AccountMovementDto;
import com.maxpos.finance.dto.AccountUpsertRequest;
import com.maxpos.finance.dto.FinanceOverviewDto;
import com.maxpos.finance.dto.ManualMovementRequest;
import com.maxpos.finance.dto.ReconcileRequest;
import com.maxpos.finance.dto.ReconciliationDto;
import com.maxpos.finance.dto.TransferRequest;
import com.maxpos.security.AppUserDetails;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

/**
 * Admin-only HTTP surface for /admin/finances. Grouped under
 * /api/finance so the front-end service has a single base path.
 */
@RestController
@RequestMapping("/api/finance")
@PreAuthorize("hasRole('ADMIN')")
public class FinanceController {

    private final AccountService accountService;
    private final AccountMovementService movementService;
    private final AccountReconciliationService reconciliationService;

    public FinanceController(AccountService accountService,
                             AccountMovementService movementService,
                             AccountReconciliationService reconciliationService) {
        this.accountService = accountService;
        this.movementService = movementService;
        this.reconciliationService = reconciliationService;
    }

    // ─── Overview ──────────────────────────────────────────────────

    @GetMapping("/overview")
    public FinanceOverviewDto overview() {
        return accountService.overview();
    }

    // ─── Accounts CRUD ─────────────────────────────────────────────

    @GetMapping("/accounts")
    public List<AccountDto> listAccounts() {
        return accountService.list();
    }

    @GetMapping("/accounts/{id}")
    public AccountDto getAccount(@PathVariable UUID id) {
        return accountService.get(id);
    }

    @PostMapping("/accounts")
    @ResponseStatus(HttpStatus.CREATED)
    public AccountDto createAccount(@Valid @RequestBody AccountUpsertRequest req) {
        return accountService.create(req);
    }

    @PutMapping("/accounts/{id}")
    public AccountDto updateAccount(@PathVariable UUID id,
                                    @Valid @RequestBody AccountUpsertRequest req) {
        return accountService.update(id, req);
    }

    // ─── Movement feed ─────────────────────────────────────────────

    /**
     * All-account movement feed. Default window: rolling 30 days.
     * Caller can override with explicit {@code from} / {@code to}
     * for monthly views or custom ranges.
     */
    @GetMapping("/movements")
    public List<AccountMovementDto> movements(
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(required = false) UUID accountId
    ) {
        Instant now = Instant.now();
        Instant fromTs = from != null ? from : now.minus(30, ChronoUnit.DAYS);
        Instant toTs   = to   != null ? to   : now;
        if (accountId != null) {
            return movementService.feedForAccount(accountId, fromTs, toTs);
        }
        return movementService.feed(fromTs, toTs);
    }

    /**
     * Server-paginated, filtered movement feed for the Finances tables.
     * {@code accountId} null = all accounts. {@code search} matches the note
     * or category; {@code from}/{@code to} are ISO instants bounding the range.
     */
    @GetMapping("/movements/search")
    public PageResponse<AccountMovementDto> searchMovements(
            @RequestParam(required = false) UUID accountId,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return movementService.feedPaged(accountId, from, to, search, page, size);
    }

    // ─── Manual entries ────────────────────────────────────────────

    @PostMapping("/in")
    @ResponseStatus(HttpStatus.CREATED)
    public AccountMovementDto recordIn(@Valid @RequestBody ManualMovementRequest req,
                                       @AuthenticationPrincipal AppUserDetails principal) {
        return movementService.recordManualIn(req, principal.getId());
    }

    @PostMapping("/out")
    @ResponseStatus(HttpStatus.CREATED)
    public AccountMovementDto recordOut(@Valid @RequestBody ManualMovementRequest req,
                                        @AuthenticationPrincipal AppUserDetails principal) {
        return movementService.recordManualOut(req, principal.getId());
    }

    @PostMapping("/transfer")
    @ResponseStatus(HttpStatus.CREATED)
    public AccountMovementDto transfer(@Valid @RequestBody TransferRequest req,
                                       @AuthenticationPrincipal AppUserDetails principal) {
        return movementService.recordTransfer(req, principal.getId());
    }

    @PostMapping("/movements/{id}/void")
    public AccountMovementDto voidMovement(@PathVariable UUID id,
                                           @AuthenticationPrincipal AppUserDetails principal) {
        return movementService.voidMovement(id, principal.getId());
    }

    // ─── Reconciliation ────────────────────────────────────────────

    @PostMapping("/reconcile")
    @ResponseStatus(HttpStatus.CREATED)
    public ReconciliationDto reconcile(@Valid @RequestBody ReconcileRequest req,
                                       @AuthenticationPrincipal AppUserDetails principal) {
        return reconciliationService.reconcile(req, principal.getId());
    }

    @GetMapping("/accounts/{id}/reconciliations")
    public List<ReconciliationDto> listReconciliations(@PathVariable UUID id) {
        return reconciliationService.listForAccount(id);
    }

    @PostMapping("/reconciliations/{id}/void")
    public ReconciliationDto voidReconciliation(@PathVariable UUID id,
                                                @AuthenticationPrincipal AppUserDetails principal) {
        return reconciliationService.voidReconciliation(id, principal.getId());
    }
}
