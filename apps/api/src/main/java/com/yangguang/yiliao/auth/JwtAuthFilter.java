package com.yangguang.yiliao.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

  private final JwtService jwtService;
  private final UserDetailsService userDetailsService;

  public JwtAuthFilter(JwtService jwtService, UserDetailsService userDetailsService) {
    this.jwtService = jwtService;
    this.userDetailsService = userDetailsService;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    String header = request.getHeader(HttpHeaders.AUTHORIZATION);
    if (header == null || !header.startsWith("Bearer ") || !jwtService.isConfigured()) {
      filterChain.doFilter(request, response);
      return;
    }
    String token = header.substring(7);
    try {
      String username = jwtService.extractUsername(token);
      if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
        UserDetails user = userDetailsService.loadUserByUsername(username);
        if (jwtService.isValid(token, user.getUsername())) {
          UsernamePasswordAuthenticationToken auth =
              new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
          auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
          SecurityContextHolder.getContext().setAuthentication(auth);
        }
      }
    } catch (Exception ignored) {
      // invalid token → leave unauthenticated
    }
    filterChain.doFilter(request, response);
  }
}
