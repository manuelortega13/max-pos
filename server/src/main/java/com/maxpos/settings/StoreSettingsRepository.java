package com.maxpos.settings;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface StoreSettingsRepository extends JpaRepository<StoreSettings, Integer> {

    /**
     * The settings row for the current store. Each store has exactly one row
     * (unique(store_id)); under @TenantId this returns that store's row (the
     * ordering just makes "the single row" deterministic). Replaces the old
     * findById(1) singleton lookup now that ids auto-allocate per store.
     */
    Optional<StoreSettings> findFirstByOrderByIdAsc();
}
