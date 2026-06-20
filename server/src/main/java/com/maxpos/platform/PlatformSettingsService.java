package com.maxpos.platform;

import com.maxpos.common.NotFoundException;
import com.maxpos.platform.audit.PlatformAuditService;
import com.maxpos.platform.dto.PlatformSettingsDto;
import com.maxpos.platform.dto.UpdatePlatformSettingsRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reads/writes the singleton platform settings. The settings row is
 * non-tenant, so this works regardless of tenant context (the public
 * registration endpoint reads it untenanted; the console edits it).
 */
@Service
@Transactional(readOnly = true)
public class PlatformSettingsService {

    private final PlatformSettingRepository repo;
    private final PlatformAuditService audit;

    public PlatformSettingsService(PlatformSettingRepository repo, PlatformAuditService audit) {
        this.repo = repo;
        this.audit = audit;
    }

    public PlatformSettingsDto get() {
        return PlatformSettingsDto.from(load());
    }

    @Transactional
    public PlatformSettingsDto update(UpdatePlatformSettingsRequest req) {
        PlatformSetting s = load();
        s.setDefaultCurrency(req.defaultCurrency().trim());
        s.setDefaultCurrencySymbol(req.defaultCurrencySymbol().trim());
        PlatformSettingsDto saved = PlatformSettingsDto.from(repo.saveAndFlush(s));
        audit.record("SETTINGS_UPDATED", null, "Platform settings",
                "default currency: " + saved.defaultCurrency());
        return saved;
    }

    private PlatformSetting load() {
        return repo.findFirstByOrderByIdAsc()
                .orElseThrow(() -> new NotFoundException("Platform settings not initialized"));
    }
}
