package com.maxpos.platform;

import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.platform.audit.PlatformAuditService;
import com.maxpos.platform.dto.CreatePlatformAdminRequest;
import com.maxpos.platform.dto.PlatformAdminDto;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/** Manage platform-admin accounts (list, create) from the console. */
@Service
@Transactional(readOnly = true)
public class PlatformAdminService {

    private final PlatformAdminRepository admins;
    private final PasswordEncoder passwordEncoder;
    private final PlatformAuditService audit;

    public PlatformAdminService(PlatformAdminRepository admins, PasswordEncoder passwordEncoder,
                                PlatformAuditService audit) {
        this.admins = admins;
        this.passwordEncoder = passwordEncoder;
        this.audit = audit;
    }

    public List<PlatformAdminDto> list() {
        return admins.findAllByOrderByCreatedAtAsc().stream().map(PlatformAdminDto::from).toList();
    }

    @Transactional
    public PlatformAdminDto create(CreatePlatformAdminRequest req) {
        String email = req.email().trim().toLowerCase();
        if (admins.existsByEmailIgnoreCase(email)) {
            throw new ConflictException("A platform admin with that email already exists.");
        }
        PlatformAdmin a = new PlatformAdmin();
        a.setName(req.name().trim());
        a.setEmail(email);
        a.setPasswordHash(passwordEncoder.encode(req.password()));
        a.setActive(true);
        PlatformAdminDto saved = PlatformAdminDto.from(admins.save(a));
        audit.record("ADMIN_CREATED", null, saved.email(), "platform admin added");
        return saved;
    }

    @Transactional
    public PlatformAdminDto setActive(UUID id, boolean active) {
        PlatformAdmin admin = admins.findById(id)
                .orElseThrow(() -> new NotFoundException("Platform admin not found"));
        if (!active) {
            // Guard against locking the platform out of its own console.
            if (id.equals(currentAdminId())) {
                throw new ConflictException("You can't disable your own account.");
            }
            if (admin.isActive() && admins.countByActiveTrue() <= 1) {
                throw new ConflictException("At least one platform admin must stay active.");
            }
        }
        admin.setActive(active);
        PlatformAdminDto saved = PlatformAdminDto.from(admins.save(admin));
        audit.record(active ? "ADMIN_ENABLED" : "ADMIN_DISABLED", null, saved.email(),
                active ? "account enabled" : "account disabled");
        return saved;
    }

    /** Id of the platform admin making the current request, or null. */
    private static UUID currentAdminId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof PlatformPrincipal p) {
            return p.getId();
        }
        return null;
    }
}
