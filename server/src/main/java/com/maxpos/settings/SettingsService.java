package com.maxpos.settings;

import com.maxpos.common.ConflictException;
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
        // Invariant: offline mode requires allow-negative-stock, because
        // queued sales replayed after a network outage may land against
        // zero/negative stock on the backend. Without the allowance, the
        // backend would reject those replays and sales would pile up stuck
        // in the cashier's local queue.
        if (req.offlineModeEnabled() && !req.allowNegativeStock()) {
            throw new ConflictException(
                    "Offline mode requires 'Allow negative stock' to be enabled");
        }

        StoreSettings s = repo.findById(1)
                .orElseThrow(() -> new NotFoundException("Store settings not initialized"));
        s.setStoreName(req.storeName());
        s.setCurrency(req.currency());
        s.setCurrencySymbol(req.currencySymbol());
        s.setTaxRate(req.taxRate());
        s.setReceiptFooter(req.receiptFooter());
        s.setAddress(req.address());
        s.setPhone(req.phone());
        s.setAllowNegativeStock(req.allowNegativeStock());
        s.setOfflineModeEnabled(req.offlineModeEnabled());
        return StoreSettingsDto.from(s);
    }
}
