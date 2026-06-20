package com.maxpos.platform.audit;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/** One append-only platform audit record. Non-tenant table. */
@Entity
@Table(name = "platform_audit_log")
public class PlatformAuditEntry {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false)
    private Instant at;

    @Column(name = "actor_email")
    private String actorEmail;

    @Column(nullable = false, length = 64)
    private String action;

    @Column(name = "target_store_id")
    private UUID targetStoreId;

    @Column(name = "target_label")
    private String targetLabel;

    @Column(columnDefinition = "text")
    private String detail;

    @PrePersist
    void onCreate() {
        if (at == null) at = Instant.now();
    }

    public UUID getId() { return id; }
    public Instant getAt() { return at; }
    public String getActorEmail() { return actorEmail; }
    public void setActorEmail(String actorEmail) { this.actorEmail = actorEmail; }
    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
    public UUID getTargetStoreId() { return targetStoreId; }
    public void setTargetStoreId(UUID targetStoreId) { this.targetStoreId = targetStoreId; }
    public String getTargetLabel() { return targetLabel; }
    public void setTargetLabel(String targetLabel) { this.targetLabel = targetLabel; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
}
