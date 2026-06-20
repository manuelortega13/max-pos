package com.maxpos.platform;

import com.maxpos.common.ConflictException;
import com.maxpos.platform.dto.CreatePlatformAdminRequest;
import com.maxpos.platform.dto.PlatformAdminDto;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** Manage platform-admin accounts (list, create) from the console. */
@Service
@Transactional(readOnly = true)
public class PlatformAdminService {

    private final PlatformAdminRepository admins;
    private final PasswordEncoder passwordEncoder;

    public PlatformAdminService(PlatformAdminRepository admins, PasswordEncoder passwordEncoder) {
        this.admins = admins;
        this.passwordEncoder = passwordEncoder;
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
        return PlatformAdminDto.from(admins.save(a));
    }
}
