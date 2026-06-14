package com.maxpos.settings;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Single-row table holding store-wide settings. We pin the primary key to 1
 * so there's never more than one row.
 */
@Entity
@Table(name = "store_settings")
public class StoreSettings {

    @Id
    private Integer id = 1;

    @Column(name = "store_name", nullable = false)
    private String storeName;

    @Column(nullable = false, length = 8)
    private String currency;

    @Column(name = "currency_symbol", nullable = false, length = 4)
    private String currencySymbol;

    @Column(name = "tax_rate", nullable = false, precision = 5, scale = 4)
    private BigDecimal taxRate;

    @Column(name = "receipt_footer", columnDefinition = "text")
    private String receiptFooter;

    private String address;
    private String phone;

    @Column(name = "allow_negative_stock", nullable = false)
    private boolean allowNegativeStock = false;

    @Column(name = "offline_mode_enabled", nullable = false)
    private boolean offlineModeEnabled = false;

    /** When true, the backend's scheduled job writes a daily database backup
     *  to disk and the admin web app downloads one daily. */
    @Column(name = "auto_backup_enabled", nullable = false)
    private boolean autoBackupEnabled = false;

    /** Default destination account for card sales / card credit
     *  payments. Picked once in Settings; the auto-tracker reads it
     *  to know which account to credit. Null disables auto-tracking
     *  of card flows (those will leave the ledger out of sync with
     *  reality — admins should set it). */
    @Column(name = "card_account_id")
    private UUID cardAccountId;

    /** Default destination account for transfer sales / transfer
     *  credit payments. Typical mapping is GCash but admin picks. */
    @Column(name = "transfer_account_id")
    private UUID transferAccountId;

    public Integer getId() { return id; }
    public String getStoreName() { return storeName; }
    public void setStoreName(String storeName) { this.storeName = storeName; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getCurrencySymbol() { return currencySymbol; }
    public void setCurrencySymbol(String currencySymbol) { this.currencySymbol = currencySymbol; }
    public BigDecimal getTaxRate() { return taxRate; }
    public void setTaxRate(BigDecimal taxRate) { this.taxRate = taxRate; }
    public String getReceiptFooter() { return receiptFooter; }
    public void setReceiptFooter(String receiptFooter) { this.receiptFooter = receiptFooter; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public boolean isAllowNegativeStock() { return allowNegativeStock; }
    public void setAllowNegativeStock(boolean allowNegativeStock) { this.allowNegativeStock = allowNegativeStock; }
    public boolean isOfflineModeEnabled() { return offlineModeEnabled; }
    public void setOfflineModeEnabled(boolean offlineModeEnabled) { this.offlineModeEnabled = offlineModeEnabled; }
    public boolean isAutoBackupEnabled() { return autoBackupEnabled; }
    public void setAutoBackupEnabled(boolean autoBackupEnabled) { this.autoBackupEnabled = autoBackupEnabled; }
    public UUID getCardAccountId() { return cardAccountId; }
    public void setCardAccountId(UUID cardAccountId) { this.cardAccountId = cardAccountId; }
    public UUID getTransferAccountId() { return transferAccountId; }
    public void setTransferAccountId(UUID transferAccountId) { this.transferAccountId = transferAccountId; }
}
