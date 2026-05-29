package com.maxpos.settings.dto;

import com.maxpos.settings.StoreSettings;

import java.math.BigDecimal;
import java.util.UUID;

public record StoreSettingsDto(
        String storeName,
        String currency,
        String currencySymbol,
        BigDecimal taxRate,
        String receiptFooter,
        String address,
        String phone,
        boolean allowNegativeStock,
        boolean offlineModeEnabled,
        UUID cardAccountId,
        UUID transferAccountId
) {
    public static StoreSettingsDto from(StoreSettings s) {
        return new StoreSettingsDto(
                s.getStoreName(),
                s.getCurrency(),
                s.getCurrencySymbol(),
                s.getTaxRate(),
                s.getReceiptFooter(),
                s.getAddress(),
                s.getPhone(),
                s.isAllowNegativeStock(),
                s.isOfflineModeEnabled(),
                s.getCardAccountId(),
                s.getTransferAccountId()
        );
    }
}
