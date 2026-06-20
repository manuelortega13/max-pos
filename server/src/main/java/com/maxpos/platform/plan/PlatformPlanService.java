package com.maxpos.platform.plan;

import com.maxpos.common.ConflictException;
import com.maxpos.platform.audit.PlatformAuditService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** Manage the subscription-plan catalog from the platform console. */
@Service
@Transactional(readOnly = true)
public class PlatformPlanService {

    private final PlanRepository plans;
    private final PlatformAuditService audit;

    public PlatformPlanService(PlanRepository plans, PlatformAuditService audit) {
        this.plans = plans;
        this.audit = audit;
    }

    public List<PlanDto> list() {
        return plans.findAllByOrderBySortOrderAscNameAsc().stream().map(PlanDto::from).toList();
    }

    @Transactional
    public PlanDto create(CreatePlanRequest req) {
        String code = req.code().trim().toLowerCase();
        if (plans.existsByCodeIgnoreCase(code)) {
            throw new ConflictException("A plan with that code already exists.");
        }
        Plan p = new Plan();
        p.setCode(code);
        p.setName(req.name().trim());
        p.setPriceCents(req.priceCents());
        p.setMaxUsers(req.maxUsers());
        p.setMaxProducts(req.maxProducts());
        p.setSortOrder(req.sortOrder());
        p.setActive(true);
        PlanDto saved = PlanDto.from(plans.save(p));
        audit.record("PLAN_CREATED", null, saved.name(), "plan added");
        return saved;
    }
}
