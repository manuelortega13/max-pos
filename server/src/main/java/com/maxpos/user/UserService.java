package com.maxpos.user;

import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.user.dto.UserCreateRequest;
import com.maxpos.user.dto.UserDto;
import com.maxpos.user.dto.UserUpdateRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class UserService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;

    public UserService(UserRepository users, PasswordEncoder passwordEncoder) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
    }

    public List<UserDto> list() {
        return users.findAll().stream().map(UserDto::from).toList();
    }

    public UserDto get(UUID id) {
        return users.findById(id).map(UserDto::from)
                .orElseThrow(() -> new NotFoundException("User not found"));
    }

    @Transactional
    public UserDto create(UserCreateRequest req) {
        if (users.existsByEmailIgnoreCase(req.email())) {
            throw new ConflictException("Email already in use");
        }
        User u = new User();
        u.setName(req.name());
        u.setEmail(req.email().toLowerCase());
        u.setPasswordHash(passwordEncoder.encode(req.password()));
        u.setRole(req.role());
        u.setActive(req.active() == null || req.active());
        return UserDto.from(users.save(u));
    }

    @Transactional
    public UserDto update(UUID id, UserUpdateRequest req) {
        User u = users.findById(id)
                .orElseThrow(() -> new NotFoundException("User not found"));

        if (!u.getEmail().equalsIgnoreCase(req.email()) && users.existsByEmailIgnoreCase(req.email())) {
            throw new ConflictException("Email already in use");
        }

        u.setName(req.name());
        u.setEmail(req.email().toLowerCase());
        u.setRole(req.role());
        u.setActive(req.active());
        if (req.password() != null && !req.password().isBlank()) {
            u.setPasswordHash(passwordEncoder.encode(req.password()));
        }
        return UserDto.from(u);
    }

    @Transactional
    public void delete(UUID id) {
        if (!users.existsById(id)) throw new NotFoundException("User not found");
        users.deleteById(id);
    }
}
