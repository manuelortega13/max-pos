package com.maxpos.settings;

import com.maxpos.common.NotFoundException;
import com.maxpos.settings.dto.StoreSettingsDto;
import com.maxpos.settings.dto.StoreSettingsUpdateRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class SettingsService {

    private final StoreSettingsRepository repo;

    public SettingsService(StoreSettingsRepository repo) {
        this.repo = repo;
    }

    public StoreSettingsDto get() {
        StoreSettings s = repo.findById(1)
                .orElseThrow(() -> new NotFoundException("Store settings not initialized"));
        return StoreSettingsDto.from(s);
    }

    @Transactional
    public StoreSettingsDto update(StoreSettingsUpdateRequest req) {
        StoreSettings s = repo.findById(1)
                .orElseThrow(() -> new NotFoundException("Store settings not initialized"));
        s.setStoreName(req.storeName());
        s.setCurrency(req.currency());
        s.setCurrencySymbol(req.currencySymbol());
        s.setTaxRate(req.taxRate());
        s.setReceiptFooter(req.receiptFooter());
        s.setAddress(req.address());
        s.setPhone(req.phone());
        return StoreSettingsDto.from(s);
    }
}
