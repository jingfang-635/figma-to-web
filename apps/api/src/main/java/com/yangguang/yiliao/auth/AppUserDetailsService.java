package com.yangguang.yiliao.auth;

import com.yangguang.yiliao.repository.AppUserRepository;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class AppUserDetailsService implements UserDetailsService {

  private final AppUserRepository appUserRepository;

  public AppUserDetailsService(AppUserRepository appUserRepository) {
    this.appUserRepository = appUserRepository;
  }

  @Override
  public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
    return appUserRepository
        .findByUsername(username)
        .map(
            u ->
                User.withUsername(u.getUsername())
                    .password(u.getPasswordHash())
                    .roles(u.getRole())
                    .build())
        .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
  }
}
