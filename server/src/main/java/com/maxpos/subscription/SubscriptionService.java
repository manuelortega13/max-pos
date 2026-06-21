package com.maxpos.subscription;

import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.platform.Store;
import com.maxpos.platform.StoreRepository;
import com.maxpos.platform.StoreStatus;
import com.maxpos.platform.audit.PlatformAuditService;
import com.maxpos.platform.fx.FxRateService;
import com.maxpos.platform.fx.FxSnapshot;
import com.maxpos.platform.plan.Plan;
import com.maxpos.platform.plan.PlanRepository;
import com.maxpos.settings.StoreSettings;
import com.maxpos.settings.StoreSettingsRepository;
import com.maxpos.subscription.dto.StorePlanDto;
import com.maxpos.subscription.dto.StorePlansResponse;
import com.maxpos.subscription.dto.SubscriptionStatusDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Owner-facing subscription: list the plans a new store can pick, record the
 * choice (trial or paid), and report current status. A trial choice stamps
 * {@code stores.trial_ends_at}; a paid choice clears it.
 *
 * <p>The {@code stores} table is the non-tenant tenancy root, so this reads/
 * writes it directly regardless of the caller's tenant context.
 */
@Service
@Transactional(readOnly = true)
public class SubscriptionService {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionService.class);

    private final StoreRepository stores;
    private final PlanRepository plans;
    private final JdbcTemplate jdbc;
    private final PlatformAuditService audit;
    private final StoreSettingsRepository storeSettings;
    private final FxRateService fxService;

    public SubscriptionService(StoreRepository stores, PlanRepository plans, JdbcTemplate jdbc,
                               PlatformAuditService audit, StoreSettingsRepository storeSettings,
                               FxRateService fxService) {
        this.stores = stores;
        this.plans = plans;
        this.jdbc = jdbc;
        this.audit = audit;
        this.storeSettings = storeSettings;
        this.fxService = fxService;
    }

    /**
     * Active plans a store owner can choose from (trial listed first). Each plan
     * is priced in its own currency; when that differs from the store's currency
     * and a live rate is available, its price is converted into the store
     * currency (and the rate is included so the page can show it).
     */
    public StorePlansResponse selectablePlans() {
        // The current store's own currency (tenant-scoped row).
        StoreSettings ss = storeSettings.findFirstByOrderByIdAsc().orElse(null);
        String storeCurrency = ss != null && ss.getCurrency() != null ? ss.getCurrency() : null;
        String storeSymbol = ss != null && ss.getCurrencySymbol() != null ? ss.getCurrencySymbol() : null;
        // Cache one FX snapshot keyed to the store currency for all conversions.
        FxSnapshot snap = storeCurrency == null ? null : fxService.snapshot(storeCurrency);

        List<StorePlanDto> rows = plans.findByActiveTrueOrderBySortOrderAscNameAsc().stream()
                .map(p -> toStorePlan(p, storeCurrency, storeSymbol, snap))
                .toList();

        return new StorePlansResponse(storeCurrency, storeSymbol, rows);
    }

    private StorePlanDto toStorePlan(Plan p, String storeCurrency, String storeSymbol,
                                     FxSnapshot snap) {
        String source = p.getCurrency();
        // Display in the plan's own currency unless we can convert to the store's.
        int displayCents = p.getPriceCents();
        String displayCurrency = source;
        String displaySymbol = p.getCurrencySymbol();
        boolean converted = false;
        BigDecimal rate = null;

        boolean needsConversion = storeCurrency != null && !storeCurrency.equalsIgnoreCase(source);
        if (needsConversion && snap != null && snap.available()) {
            BigDecimal m = snap.multiplierFor(source); // store units per 1 plan-currency unit
            if (m != null) {
                converted = true;
                rate = m;
                displayCents = m.multiply(BigDecimal.valueOf(p.getPriceCents()))
                        .setScale(0, RoundingMode.HALF_UP).intValue();
                displayCurrency = storeCurrency;
                displaySymbol = storeSymbol;
            }
        }
        return new StorePlanDto(p.getId(), p.getCode(), p.getName(), p.getTrialDays(),
                p.getMaxUsers(), p.getMaxProducts(),
                p.getPriceCents(), source, p.getCurrencySymbol(),
                displayCents, displayCurrency, displaySymbol, converted, rate);
    }

    public SubscriptionStatusDto status(UUID storeId) {
        Store store = stores.findById(storeId)
                .orElseThrow(() -> new NotFoundException("Store not found"));
        return toStatus(store);
    }

    /**
     * Record the owner's plan choice. A trial can only be started once (before
     * any plan is chosen) to prevent re-trialing; afterwards only paid plans
     * are selectable.
     */
    @Transactional
    public SubscriptionStatusDto subscribe(UUID storeId, UUID planId) {
        Store store = stores.findById(storeId)
                .orElseThrow(() -> new NotFoundException("Store not found"));
        Plan plan = plans.findById(planId)
                .orElseThrow(() -> new NotFoundException("Plan not found"));
        if (!plan.isActive()) {
            throw new ConflictException("That plan is not available.");
        }
        if (plan.isTrial() && store.getPlanId() != null) {
            throw new ConflictException("The free trial is only available before choosing a plan.");
        }

        store.setPlanId(plan.getId());
        store.setTrialEndsAt(plan.isTrial()
                ? Instant.now().plus(plan.getTrialDays(), ChronoUnit.DAYS)
                : null);
        stores.saveAndFlush(store);

        audit.record("STORE_SUBSCRIBED", store.getId(), store.getName(),
                plan.isTrial() ? "started " + plan.getName() : "subscribed to " + plan.getName());
        return toStatus(store);
    }

    /**
     * Suspend stores whose trial lapsed without moving to a paid plan (a paid
     * choice clears trial_ends_at, so only un-upgraded trials match). Returns
     * the number suspended. Driven by {@link TrialExpiryScheduler}.
     */
    @Transactional
    public int suspendExpiredTrials() {
        List<Map<String, Object>> expired = jdbc.queryForList(
                "SELECT id, name FROM stores "
                        + "WHERE status = 'ACTIVE' AND trial_ends_at IS NOT NULL AND trial_ends_at < now()");
        for (Map<String, Object> row : expired) {
            UUID id = (UUID) row.get("id");
            String name = (String) row.get("name");
            jdbc.update("UPDATE stores SET status = 'SUSPENDED' WHERE id = ?", id);
            audit.record("STORE_SUSPENDED", id, name, "trial expired");
        }
        if (!expired.isEmpty()) {
            log.info("Suspended {} store(s) with expired trials", expired.size());
        }
        return expired.size();
    }

    private SubscriptionStatusDto toStatus(Store store) {
        UUID planId = store.getPlanId();
        Plan plan = planId == null ? null : plans.findById(planId).orElse(null);
        Instant trialEndsAt = store.getTrialEndsAt();
        boolean onTrial = trialEndsAt != null;
        Integer daysLeft = null;
        if (onTrial) {
            // Round up so a freshly started 7-day trial reads "7 days left" and
            // the final partial day reads "1" (not 0); 0 only once expired.
            long ms = Duration.between(Instant.now(), trialEndsAt).toMillis();
            daysLeft = ms <= 0 ? 0 : (int) Math.ceil(ms / 86_400_000.0);
        }
        return new SubscriptionStatusDto(
                plan != null,
                planId,
                plan == null ? null : plan.getCode(),
                plan == null ? null : plan.getName(),
                plan == null ? 0 : plan.getPriceCents(),
                onTrial,
                trialEndsAt,
                daysLeft,
                store.getStatus() == null ? StoreStatus.ACTIVE.name() : store.getStatus().name());
    }
}
