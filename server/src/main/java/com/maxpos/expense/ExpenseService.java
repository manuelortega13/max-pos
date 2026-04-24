package com.maxpos.expense;

import com.maxpos.common.NotFoundException;
import com.maxpos.expense.dto.ExpenseDto;
import com.maxpos.expense.dto.ExpenseUpsertRequest;
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

    public ExpenseService(ExpenseRepository expenses, UserRepository users) {
        this.expenses = expenses;
        this.users = users;
    }

    public List<ExpenseDto> list(Optional<LocalDate> from, Optional<LocalDate> to) {
        List<Expense> rows = (from.isPresent() && to.isPresent())
                ? expenses.findAllByDateBetweenOrderByDateDescCreatedAtDesc(from.get(), to.get())
                : expenses.findAllByOrderByDateDescCreatedAtDesc();
        return rows.stream().map(ExpenseDto::from).toList();
    }

    @Transactional
    public ExpenseDto create(ExpenseUpsertRequest req, UUID creatorId) {
        User creator = users.findById(creatorId).orElse(null);
        Expense e = new Expense();
        apply(e, req);
        e.setCreatedBy(creator);
        return ExpenseDto.from(expenses.save(e));
    }

    @Transactional
    public ExpenseDto update(UUID id, ExpenseUpsertRequest req) {
        Expense e = expenses.findById(id)
                .orElseThrow(() -> new NotFoundException("Expense not found"));
        apply(e, req);
        return ExpenseDto.from(e);
    }

    @Transactional
    public void delete(UUID id) {
        if (!expenses.existsById(id)) throw new NotFoundException("Expense not found");
        expenses.deleteById(id);
    }

    private void apply(Expense e, ExpenseUpsertRequest req) {
        e.setDate(req.date());
        e.setCategory(req.category() == null || req.category().isBlank() ? null : req.category().trim());
        e.setDescription(req.description().trim());
        e.setAmount(req.amount());
    }
}
