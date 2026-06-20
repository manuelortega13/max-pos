package com.maxpos.platform.audit;

import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Records and reads platform audit entries. {@link #record} resolves the
 * acting platform admin from the security context, so call sites only pass
 * the action and target.
 */
@Service
@Transactional(readOnly = true)
public class PlatformAuditService {

    private static final int MAX_LIMIT = 500;

    private final PlatformAuditRepository repo;

    public PlatformAuditService(PlatformAuditRepository repo) {
        this.repo = repo;
    }

    /** Record an action in its own transaction, so it persists regardless of
     *  the caller's transaction mode (some platform actions run read-only).
     *  Always the final step of an action, so there's no "logged but rolled
     *  back" risk. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String action, UUID targetStoreId, String targetLabel, String detail) {
        PlatformAuditEntry e = new PlatformAuditEntry();
        e.setAction(action);
        e.setActorEmail(currentActor());
        e.setTargetStoreId(targetStoreId);
        e.setTargetLabel(targetLabel);
        e.setDetail(detail);
        repo.save(e);
    }

    public List<PlatformAuditEntry> recent(int limit) {
        int safe = Math.min(Math.max(limit, 1), MAX_LIMIT);
        return repo.findAllByOrderByAtDesc(PageRequest.of(0, safe)).getContent();
    }

    /** Email of the current platform admin, or null when unauthenticated
     *  (e.g. public store registration). */
    private static String currentActor() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) return null;
        String name = auth.getName();
        return (name == null || "anonymousUser".equals(name)) ? null : name;
    }
}
