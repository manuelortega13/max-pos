package com.maxpos.platform.audit;

import java.time.Instant;
import java.util.UUID;

public record PlatformAuditDto(
        UUID id,
        Instant at,
        String actorEmail,
        String action,
        UUID targetStoreId,
        String targetLabel,
        String detail
) {
    public static PlatformAuditDto from(PlatformAuditEntry e) {
        return new PlatformAuditDto(e.getId(), e.getAt(), e.getActorEmail(), e.getAction(),
                e.getTargetStoreId(), e.getTargetLabel(), e.getDetail());
    }
}
