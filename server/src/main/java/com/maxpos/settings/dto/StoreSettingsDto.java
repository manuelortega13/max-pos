package com.maxpos.settings.dto;

import com.maxpos.settings.StoreSettings;

import java.math.BigDecimal;

public record StoreSettingsDto(
        String storeName,
        String currency,
        String currencySymbol,
        BigDecimal taxRate,
        String receiptFooter,
        String address,
        String phone,
        boolean allowNegativeStock
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
                s.isAllowNegativeStock()
        );
    }
}
