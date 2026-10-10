package com.yangguang.yiliao.auth;

import jakarta.validation.constraints.NotBlank;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

  private final AuthenticationManager authenticationManager;
  private final JwtService jwtService;

  public AuthController(AuthenticationManager authenticationManager, JwtService jwtService) {
    this.authenticationManager = authenticationManager;
    this.jwtService = jwtService;
  }

  public record LoginRequest(@NotBlank String username, @NotBlank String password) {}

  @PostMapping("/login")
  public ResponseEntity<?> login(@RequestBody LoginRequest request) {
    if (!jwtService.isConfigured()) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
          .body(Map.of("error", "JWT_SECRET env key is missing or empty"));
    }
    try {
      authenticationManager.authenticate(
          new UsernamePasswordAuthenticationToken(request.username(), request.password()));
      String token = jwtService.createToken(request.username());
      return ResponseEntity.ok(Map.of("token", token));
    } catch (AuthenticationException ex) {
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
          .body(Map.of("error", "Invalid credentials"));
    } catch (IllegalStateException ex) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
          .body(Map.of("error", ex.getMessage()));
    }
  }
}
