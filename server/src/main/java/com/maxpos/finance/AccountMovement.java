package com.maxpos.finance;

import com.maxpos.user.User;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One unit of money movement against an {@link Account}. The
 * denormalized ledger that the Finance page reads from — every
 * sale, refund, GCash/load transaction, expense, manual entry, and
 * reconciliation adjustment writes one (or sometimes two — see
 * GCash cash-out's amount + fee split) row(s) here.
 *
 * Soft-void via {@link #voidedAt} + {@link #voidedBy} so a voided
 * source row's effect on balances disappears without losing audit
 * history. The partial index on (account_id, occurred_at DESC)
 * WHERE voided_at IS NULL keeps balance queries fast.
 */
@Entity
@Table(name = "account_movements")
public class AccountMovement {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 4)
    private MovementDirection direction;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    /** Free-text bucket name — see {@link MovementCategory} for the
     *  constants the auto-tracker uses; manual entries can write any
     *  string up to 32 chars. Drives the breakdown panel grouping. */
    @Column(nullable = false, length = 32)
    private String category;

    @Column(columnDefinition = "text")
    private String note;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    /** Inherited from the source row (cashier who rang the sale,
     *  admin who recorded the manual entry). Null is allowed for
     *  edge cases — backfill rows from V24 set this from existing
     *  user FKs. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recorded_by")
    private User recordedBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_kind", nullable = false, length = 20)
    private MovementSourceKind sourceKind;

    /** FK back to the source row when applicable. Used to find +
     *  void all movements when the source is voided; also lets the
     *  movement feed link to "View source sale" etc. */
    @Column(name = "source_id")
    private UUID sourceId;

    /** For {@link MovementSourceKind#TRANSFER}: the matching row on
     *  the other side of the transfer. The OUT row's transferPair
     *  points at the IN row and vice versa. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "transfer_pair_id")
    private AccountMovement transferPair;

    @Column(name = "voided_at")
    private Instant voidedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "voided_by")
    private User voidedBy;

    @PrePersist
    void onCreate() {
        if (occurredAt == null) occurredAt = Instant.now();
    }

    public UUID getId() { return id; }
    public Account getAccount() { return account; }
    public void setAccount(Account account) { this.account = account; }
    public MovementDirection getDirection() { return direction; }
    public void setDirection(MovementDirection direction) { this.direction = direction; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
    public User getRecordedBy() { return recordedBy; }
    public void setRecordedBy(User recordedBy) { this.recordedBy = recordedBy; }
    public MovementSourceKind getSourceKind() { return sourceKind; }
    public void setSourceKind(MovementSourceKind sourceKind) { this.sourceKind = sourceKind; }
    public UUID getSourceId() { return sourceId; }
    public void setSourceId(UUID sourceId) { this.sourceId = sourceId; }
    public AccountMovement getTransferPair() { return transferPair; }
    public void setTransferPair(AccountMovement transferPair) { this.transferPair = transferPair; }
    public Instant getVoidedAt() { return voidedAt; }
    public void setVoidedAt(Instant voidedAt) { this.voidedAt = voidedAt; }
    public User getVoidedBy() { return voidedBy; }
    public void setVoidedBy(User voidedBy) { this.voidedBy = voidedBy; }
}
