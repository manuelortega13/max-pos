package com.maxpos.expense;

import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.expense.dto.ExpenseDto;
import com.maxpos.expense.dto.ExpenseUpsertRequest;
import com.maxpos.finance.Account;
import com.maxpos.finance.AccountMovementService;
import com.maxpos.finance.AccountRepository;
import com.maxpos.finance.MovementSourceKind;
import com.maxpos.user.User;
import com.maxpos.user.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class ExpenseService {

    private final ExpenseRepository expenses;
    private final UserRepository users;
    private final AccountRepository accounts;
    private final AccountMovementService accountMovements;

    public ExpenseService(ExpenseRepository expenses,
                          UserRepository users,
                          AccountRepository accounts,
                          AccountMovementService accountMovements) {
        this.expenses = expenses;
        this.users = users;
        this.accounts = accounts;
        this.accountMovements = accountMovements;
    }

    public List<ExpenseDto> list(Optional<LocalDate> from, Optional<LocalDate> to) {
        List<Expense> rows = (from.isPresent() && to.isPresent())
                ? expenses.findAllByDateBetweenOrderByDateDescCreatedAtDesc(from.get(), to.get())
                : expenses.findAllByOrderByDateDescCreatedAtDesc();
        return rows.stream().map(ExpenseDto::from).toList();
    }

    @Transactional
    public ExpenseDto create(ExpenseUpsertRequest req, UUID creatorId) {
        Account paymentAccount = resolveAccount(req.paymentAccountId());
        User creator = users.findById(creatorId).orElse(null);
        Expense e = new Expense();
        apply(e, req);
        e.setCreatedBy(creator);
        Expense saved = expenses.save(e);
        // Finance ledger — write the OUT movement against the chosen
        // payment account.
        accountMovements.recordForExpense(saved, paymentAccount);
        return ExpenseDto.from(saved);
    }

    @Transactional
    public ExpenseDto update(UUID id, ExpenseUpsertRequest req) {
        Expense e = expenses.findById(id)
                .orElseThrow(() -> new NotFoundException("Expense not found"));
        // Resolve target so a bad UUID is rejected up front.
        Account newAccount = resolveAccount(req.paymentAccountId());
        boolean accountChanged = !req.paymentAccountId().equals(e.getPaymentAccountId());
        apply(e, req);
        if (accountChanged) {
            // Repost — void prior movements and create fresh under the
            // new account. Amount/category changes also flow through.
            accountMovements.voidMovementsForSource(
                    MovementSourceKind.EXPENSE, e.getId(), e.getCreatedBy());
            accountMovements.recordForExpense(e, newAccount);
        }
        return ExpenseDto.from(e);
    }

    @Transactional
    public void delete(UUID id) {
        Expense e = expenses.findById(id)
                .orElseThrow(() -> new NotFoundException("Expense not found"));
        // Void the ledger row first so a deleted expense doesn't
        // leave a dangling OUT movement.
        accountMovements.voidMovementsForSource(
                MovementSourceKind.EXPENSE, e.getId(), e.getCreatedBy());
        expenses.delete(e);
    }

    private Account resolveAccount(UUID accountId) {
        Account account = accounts.findById(accountId)
                .orElseThrow(() -> new NotFoundException("Payment account not found"));
        if (!account.isActive()) {
            throw new ConflictException("Cannot record an expense against an inactive account.");
        }
        return account;
    }

    private void apply(Expense e, ExpenseUpsertRequest req) {
        e.setDate(req.date());
        e.setCategory(req.category() == null || req.category().isBlank() ? null : req.category().trim());
        e.setDescription(req.description().trim());
        e.setAmount(req.amount());
        e.setPaymentAccountId(req.paymentAccountId());
    }
}
