package com.maxpos.platform;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PlatformSettingRepository extends JpaRepository<PlatformSetting, Integer> {
    Optional<PlatformSetting> findFirstByOrderByIdAsc();
}
