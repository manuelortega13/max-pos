package com.maxpos.businessday;

import com.maxpos.user.User;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One open-close cycle of the register. Opened by an admin with a cash float;
 * closed by an admin after counting the drawer. Snapshot totals are written
 * at close time so the Z-report stays stable even if individual sales are
 * later refunded or edited.
 */
@Entity
@Table(name = "business_days")
public class BusinessDay {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "opened_at", nullable = false)
    private Instant openedAt;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "opened_by", nullable = false)
    private User openedBy;

    @Column(name = "opening_float", nullable = false, precision = 12, scale = 2)
    private BigDecimal openingFloat;

    @Column(name = "closed_at")
    private Instant closedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "closed_by")
    private User closedBy;

    @Column(name = "counted_cash", precision = 12, scale = 2)
    private BigDecimal countedCash;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(name = "expected_cash", precision = 12, scale = 2)
    private BigDecimal expectedCash;

    @Column(precision = 12, scale = 2)
    private BigDecimal variance;

    @Column(name = "total_sales", precision = 12, scale = 2)
    private BigDecimal totalSales;

    @Column(name = "total_refunds", precision = 12, scale = 2)
    private BigDecimal totalRefunds;

    @Column(name = "cash_sales", precision = 12, scale = 2)
    private BigDecimal cashSales;

    @Column(name = "cash_refunds", precision = 12, scale = 2)
    private BigDecimal cashRefunds;

    @Column(name = "card_sales", precision = 12, scale = 2)
    private BigDecimal cardSales;

    @Column(name = "transfer_sales", precision = 12, scale = 2)
    private BigDecimal transferSales;

    /** E-wallet / bank sales. Like card/transfer, they don't touch the
     *  cash drawer — kept as separate Z-report buckets. */
    @Column(name = "gcash_sales", precision = 12, scale = 2)
    private BigDecimal gcashSales;

    @Column(name = "maya_sales", precision = 12, scale = 2)
    private BigDecimal mayaSales;

    @Column(name = "bank_sales", precision = 12, scale = 2)
    private BigDecimal bankSales;

    /** Charge-on-account sales — no money in the till, but the
     *  day's credit volume still belongs on the Z-report. */
    @Column(name = "credit_sales", precision = 12, scale = 2)
    private BigDecimal creditSales;

    /** Cash collected as creditor settlements during this day.
     *  Adds to the till the same way cashSales does — included in
     *  the expected-cash formula at close. Card / transfer credit
     *  payments don't enter the cash reconciliation; they live at
     *  the payment row level. */
    @Column(name = "cash_credit_payments", precision = 12, scale = 2)
    private BigDecimal cashCreditPayments;

    @Column(name = "sales_count")
    private Integer salesCount;

    @Column(name = "items_sold")
    private Integer itemsSold;

    // GCash buckets. Cash-in adds (amount + fee) to the till;
    // cash-out removes amount but keeps fee. Stored as four separate
    // columns so the Z-report can show volume and fee revenue cleanly.
    @Column(name = "gcash_cash_in_amount", precision = 12, scale = 2)
    private BigDecimal gcashCashInAmount;

    @Column(name = "gcash_cash_in_fees", precision = 12, scale = 2)
    private BigDecimal gcashCashInFees;

    @Column(name = "gcash_cash_out_amount", precision = 12, scale = 2)
    private BigDecimal gcashCashOutAmount;

    @Column(name = "gcash_cash_out_fees", precision = 12, scale = 2)
    private BigDecimal gcashCashOutFees;

    // Load buckets. Always cash-in (customer hands cash, store sends
    // load), so a single pair of amount + fees columns mirrors the
    // GCash cash-in side.
    @Column(name = "load_amount", precision = 12, scale = 2)
    private BigDecimal loadAmount;

    @Column(name = "load_fees", precision = 12, scale = 2)
    private BigDecimal loadFees;

    /** Sum of mid-day cash top-ups to the opening float (excluding
     *  voided additions). Frozen at close time; live preview comes
     *  from FloatAdditionRepository directly. */
    @Column(name = "float_additions", precision = 12, scale = 2)
    private BigDecimal floatAdditions;

    public UUID getId() { return id; }
    public Instant getOpenedAt() { return openedAt; }
    public void setOpenedAt(Instant openedAt) { this.openedAt = openedAt; }
    public User getOpenedBy() { return openedBy; }
    public void setOpenedBy(User openedBy) { this.openedBy = openedBy; }
    public BigDecimal getOpeningFloat() { return openingFloat; }
    public void setOpeningFloat(BigDecimal openingFloat) { this.openingFloat = openingFloat; }
    public Instant getClosedAt() { return closedAt; }
    public void setClosedAt(Instant closedAt) { this.closedAt = closedAt; }
    public User getClosedBy() { return closedBy; }
    public void setClosedBy(User closedBy) { this.closedBy = closedBy; }
    public BigDecimal getCountedCash() { return countedCash; }
    public void setCountedCash(BigDecimal countedCash) { this.countedCash = countedCash; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public BigDecimal getExpectedCash() { return expectedCash; }
    public void setExpectedCash(BigDecimal expectedCash) { this.expectedCash = expectedCash; }
    public BigDecimal getVariance() { return variance; }
    public void setVariance(BigDecimal variance) { this.variance = variance; }
    public BigDecimal getTotalSales() { return totalSales; }
    public void setTotalSales(BigDecimal totalSales) { this.totalSales = totalSales; }
    public BigDecimal getTotalRefunds() { return totalRefunds; }
    public void setTotalRefunds(BigDecimal totalRefunds) { this.totalRefunds = totalRefunds; }
    public BigDecimal getCashSales() { return cashSales; }
    public void setCashSales(BigDecimal cashSales) { this.cashSales = cashSales; }
    public BigDecimal getCashRefunds() { return cashRefunds; }
    public void setCashRefunds(BigDecimal cashRefunds) { this.cashRefunds = cashRefunds; }
    public BigDecimal getGcashSales() { return gcashSales; }
    public void setGcashSales(BigDecimal gcashSales) { this.gcashSales = gcashSales; }
    public BigDecimal getMayaSales() { return mayaSales; }
    public void setMayaSales(BigDecimal mayaSales) { this.mayaSales = mayaSales; }
    public BigDecimal getBankSales() { return bankSales; }
    public void setBankSales(BigDecimal bankSales) { this.bankSales = bankSales; }
    public BigDecimal getCardSales() { return cardSales; }
    public void setCardSales(BigDecimal cardSales) { this.cardSales = cardSales; }
    public BigDecimal getTransferSales() { return transferSales; }
    public void setTransferSales(BigDecimal transferSales) { this.transferSales = transferSales; }
    public BigDecimal getCreditSales() { return creditSales; }
    public void setCreditSales(BigDecimal creditSales) { this.creditSales = creditSales; }
    public BigDecimal getCashCreditPayments() { return cashCreditPayments; }
    public void setCashCreditPayments(BigDecimal cashCreditPayments) { this.cashCreditPayments = cashCreditPayments; }
    public Integer getSalesCount() { return salesCount; }
    public void setSalesCount(Integer salesCount) { this.salesCount = salesCount; }
    public Integer getItemsSold() { return itemsSold; }
    public void setItemsSold(Integer itemsSold) { this.itemsSold = itemsSold; }
    public BigDecimal getGcashCashInAmount() { return gcashCashInAmount; }
    public void setGcashCashInAmount(BigDecimal gcashCashInAmount) { this.gcashCashInAmount = gcashCashInAmount; }
    public BigDecimal getGcashCashInFees() { return gcashCashInFees; }
    public void setGcashCashInFees(BigDecimal gcashCashInFees) { this.gcashCashInFees = gcashCashInFees; }
    public BigDecimal getGcashCashOutAmount() { return gcashCashOutAmount; }
    public void setGcashCashOutAmount(BigDecimal gcashCashOutAmount) { this.gcashCashOutAmount = gcashCashOutAmount; }
    public BigDecimal getGcashCashOutFees() { return gcashCashOutFees; }
    public void setGcashCashOutFees(BigDecimal gcashCashOutFees) { this.gcashCashOutFees = gcashCashOutFees; }
    public BigDecimal getLoadAmount() { return loadAmount; }
    public void setLoadAmount(BigDecimal loadAmount) { this.loadAmount = loadAmount; }
    public BigDecimal getLoadFees() { return loadFees; }
    public void setLoadFees(BigDecimal loadFees) { this.loadFees = loadFees; }
    public BigDecimal getFloatAdditions() { return floatAdditions; }
    public void setFloatAdditions(BigDecimal floatAdditions) { this.floatAdditions = floatAdditions; }
}
