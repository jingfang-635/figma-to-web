package com.yangguang.yiliao.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class JwtService {

  private final String secret;
  private final long expirationMs;

  public JwtService(
      @Value("${app.jwt.secret:}") String secret,
      @Value("${app.jwt.expiration-ms:86400000}") long expirationMs) {
    this.secret = secret == null ? "" : secret.trim();
    this.expirationMs = expirationMs;
  }

  public boolean isConfigured() {
    return !secret.isEmpty();
  }

  public String createToken(String username) {
    ensureConfigured();
    Date now = new Date();
    Date exp = new Date(now.getTime() + expirationMs);
    return Jwts.builder()
        .subject(username)
        .issuedAt(now)
        .expiration(exp)
        .signWith(key())
        .compact();
  }

  public String extractUsername(String token) {
    ensureConfigured();
    return parseClaims(token).getSubject();
  }

  public boolean isValid(String token, String username) {
    ensureConfigured();
    Claims claims = parseClaims(token);
    return username.equals(claims.getSubject()) && claims.getExpiration().after(new Date());
  }

  private Claims parseClaims(String token) {
    return Jwts.parser().verifyWith(key()).build().parseSignedClaims(token).getPayload();
  }

  private SecretKey key() {
    byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
    if (bytes.length < 32) {
      byte[] padded = new byte[32];
      System.arraycopy(bytes, 0, padded, 0, bytes.length);
      bytes = padded;
    }
    return Keys.hmacShaKeyFor(bytes);
  }

  private void ensureConfigured() {
    if (!isConfigured()) {
      throw new IllegalStateException("JWT_SECRET env key is missing or empty");
    }
  }
}
