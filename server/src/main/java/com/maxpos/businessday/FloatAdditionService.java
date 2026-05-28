package com.maxpos.businessday;

import com.maxpos.businessday.dto.CreateFloatAdditionRequest;
import com.maxpos.businessday.dto.FloatAdditionDto;
import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.user.User;
import com.maxpos.user.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Audit log for mid-day cash float top-ups. Always operates against
 * the currently-open business day — admins don't pick a target day
 * because there's only ever one open day at a time.
 */
@Service
@Transactional(readOnly = true)
public class FloatAdditionService {

    private final FloatAdditionRepository additions;
    private final BusinessDayRepository businessDays;
    private final UserRepository users;

    @PersistenceContext
    private EntityManager em;

    public FloatAdditionService(FloatAdditionRepository additions,
                                BusinessDayRepository businessDays,
                                UserRepository users) {
        this.additions = additions;
        this.businessDays = businessDays;
        this.users = users;
    }

    /** Newest first — drives the EoD live preview log. */
    public List<FloatAdditionDto> listForCurrent() {
        return businessDays.findFirstByClosedAtIsNull()
                .map((d) -> additions.findAllByBusinessDayIdOrderByAddedAtDesc(d.getId())
                        .stream().map(FloatAdditionDto::from).toList())
                .orElseGet(List::of);
    }

    @Transactional
    public FloatAdditionDto add(CreateFloatAdditionRequest req, UUID adminId) {
        BusinessDay openDay = businessDays.findFirstByClosedAtIsNull().orElseThrow(
                () -> new ConflictException("No business day is open."));
        User admin = users.findById(adminId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        FloatAddition a = new FloatAddition();
        a.setBusinessDay(openDay);
        a.setAmount(req.amount());
        a.setNote(req.note() == null || req.note().isBlank() ? null : req.note().trim());
        a.setAddedAt(Instant.now());
        a.setAddedBy(admin);
        return FloatAdditionDto.from(additions.save(a));
    }

    @Transactional
    public FloatAdditionDto voidAddition(UUID id, UUID adminId, String reason) {
        FloatAddition a = additions.findById(id)
                .orElseThrow(() -> new NotFoundException("Float addition not found"));
        if (a.getVoidedAt() != null) {
            throw new ConflictException("Already voided.");
        }
        // Block voiding additions that belong to a closed day —
        // the snapshot is frozen at that point and changing inputs
        // would make the historical reconciliation inconsistent.
        if (a.getBusinessDay().getClosedAt() != null) {
            throw new ConflictException("Cannot void — the business day has already been closed.");
        }
        User admin = users.findById(adminId)
                .orElseThrow(() -> new NotFoundException("User not found"));
        a.setVoidedAt(Instant.now());
        a.setVoidedBy(admin);
        if (reason != null && !reason.isBlank()) {
            String trimmed = reason.trim();
            String prior = a.getNote() == null ? "" : a.getNote() + "\n";
            a.setNote(prior + "[VOID] " + trimmed);
        }
        em.flush();
        em.refresh(a);
        return FloatAdditionDto.from(a);
    }
}
