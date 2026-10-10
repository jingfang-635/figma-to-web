package com.yangguang.yiliao.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "doctors")
public class Doctor {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(length = 512)
  private String avatar;

  @Column(nullable = false, length = 64)
  private String name;

  @Column(nullable = false, length = 64)
  private String title;

  @Column(nullable = false)
  private Long departmentId;

  @Column(nullable = false, precision = 10, scale = 2)
  private BigDecimal fee;

  private Integer yearsExperience;

  @Column(precision = 5, scale = 2)
  private BigDecimal rating;

  @Lob
  private String specialty;

  @Column(nullable = false, length = 32)
  private String status;

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public String getAvatar() {
    return avatar;
  }

  public void setAvatar(String avatar) {
    this.avatar = avatar;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public Long getDepartmentId() {
    return departmentId;
  }

  public void setDepartmentId(Long departmentId) {
    this.departmentId = departmentId;
  }

  public BigDecimal getFee() {
    return fee;
  }

  public void setFee(BigDecimal fee) {
    this.fee = fee;
  }

  public Integer getYearsExperience() {
    return yearsExperience;
  }

  public void setYearsExperience(Integer yearsExperience) {
    this.yearsExperience = yearsExperience;
  }

  public BigDecimal getRating() {
    return rating;
  }

  public void setRating(BigDecimal rating) {
    this.rating = rating;
  }

  public String getSpecialty() {
    return specialty;
  }

  public void setSpecialty(String specialty) {
    this.specialty = specialty;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }
}
