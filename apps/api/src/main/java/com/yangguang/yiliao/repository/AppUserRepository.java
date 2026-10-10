package com.yangguang.yiliao.repository;

import com.yangguang.yiliao.entity.AppUser;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {
  Optional<AppUser> findByUsername(String username);

  boolean existsByUsername(String username);
}
