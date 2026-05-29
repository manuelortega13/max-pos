package com.maxpos.finance.dto;

import com.maxpos.finance.Account;
import com.maxpos.finance.AccountKind;

import java.time.Instant;
import java.util.UUID;

public record AccountDto(
        UUID id,
        String name,
        AccountKind kind,
        boolean active,
        int sortOrder,
        Instant createdAt
) {
    public static AccountDto from(Account a) {
        return new AccountDto(a.getId(), a.getName(), a.getKind(),
                a.isActive(), a.getSortOrder(), a.getCreatedAt());
    }
}
