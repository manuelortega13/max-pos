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

    @Column(name = "sales_count")
    private Integer salesCount;

    @Column(name = "items_sold")
    private Integer itemsSold;

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
    public BigDecimal getCardSales() { return cardSales; }
    public void setCardSales(BigDecimal cardSales) { this.cardSales = cardSales; }
    public BigDecimal getTransferSales() { return transferSales; }
    public void setTransferSales(BigDecimal transferSales) { this.transferSales = transferSales; }
    public Integer getSalesCount() { return salesCount; }
    public void setSalesCount(Integer salesCount) { this.salesCount = salesCount; }
    public Integer getItemsSold() { return itemsSold; }
    public void setItemsSold(Integer itemsSold) { this.itemsSold = itemsSold; }
}
