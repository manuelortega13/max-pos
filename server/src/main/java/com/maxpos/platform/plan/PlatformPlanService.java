package com.maxpos.platform.plan;

import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.platform.StoreRepository;
import com.maxpos.platform.audit.PlatformAuditService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/** Manage the subscription-plan catalog from the platform console. */
@Service
@Transactional(readOnly = true)
public class PlatformPlanService {

    private final PlanRepository plans;
    private final StoreRepository stores;
    private final PlatformAuditService audit;

    public PlatformPlanService(PlanRepository plans, StoreRepository stores,
                               PlatformAuditService audit) {
        this.plans = plans;
        this.stores = stores;
        this.audit = audit;
    }

    public List<PlanDto> list() {
        return plans.findAllByOrderBySortOrderAscNameAsc().stream()
                .map(p -> PlanDto.from(p, stores.countByPlanId(p.getId())))
                .toList();
    }

    @Transactional
    public PlanDto create(CreatePlanRequest req) {
        String code = req.code().trim().toLowerCase();
        if (plans.existsByCodeIgnoreCase(code)) {
            throw new ConflictException("A plan with that code already exists.");
        }
        Plan p = new Plan();
        p.setCode(code);
        // Currency is set once here and never changed by update().
        p.setCurrency(req.currency().trim().toUpperCase());
        p.setCurrencySymbol(req.currencySymbol().trim());
        applyFields(p, req);
        p.setActive(true);
        PlanDto saved = PlanDto.from(plans.save(p), 0);
        audit.record("PLAN_CREATED", null, saved.name(), "plan added");
        return saved;
    }

    @Transactional
    public PlanDto update(UUID id, CreatePlanRequest req) {
        Plan p = plans.findById(id).orElseThrow(() -> new NotFoundException("Plan not found"));
        String code = req.code().trim().toLowerCase();
        // Code must stay unique, but a plan keeping its own code is fine.
        plans.findByCodeIgnoreCase(code)
                .filter(other -> !other.getId().equals(id))
                .ifPresent(other -> {
                    throw new ConflictException("A plan with that code already exists.");
                });
        p.setCode(code);
        // Note: currency is intentionally NOT updated — it's fixed at creation.
        applyFields(p, req);
        PlanDto saved = PlanDto.from(plans.saveAndFlush(p), stores.countByPlanId(id));
        audit.record("PLAN_UPDATED", null, saved.name(), "plan edited");
        return saved;
    }

    @Transactional
    public void delete(UUID id) {
        Plan p = plans.findById(id).orElseThrow(() -> new NotFoundException("Plan not found"));
        long subscribers = stores.countByPlanId(id);
        if (subscribers > 0) {
            throw new ConflictException(
                    "Can't delete a plan that " + subscribers + " store(s) are subscribed to.");
        }
        plans.delete(p);
        audit.record("PLAN_DELETED", null, p.getName(), "plan removed");
    }

    private static void applyFields(Plan p, CreatePlanRequest req) {
        p.setName(req.name().trim());
        p.setPriceCents(req.priceCents());
        p.setMaxUsers(req.maxUsers());
        p.setMaxProducts(req.maxProducts());
        p.setSortOrder(req.sortOrder());
        p.setTrialDays(req.trialDays());
    }
}
