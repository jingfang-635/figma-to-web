package com.yangguang.yiliao.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;

@Entity
@Table(name = "schedules")
public class Schedule {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private Long doctorId;

  @Column(nullable = false)
  private LocalDate date;

  @Column(nullable = false, length = 32)
  private String period;

  @Column(nullable = false)
  private Integer quota;

  private Integer bookedCount;

  @Column(nullable = false, length = 32)
  private String status;

  @Column(length = 512)
  private String remark;

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public Long getDoctorId() {
    return doctorId;
  }

  public void setDoctorId(Long doctorId) {
    this.doctorId = doctorId;
  }

  public LocalDate getDate() {
    return date;
  }

  public void setDate(LocalDate date) {
    this.date = date;
  }

  public String getPeriod() {
    return period;
  }

  public void setPeriod(String period) {
    this.period = period;
  }

  public Integer getQuota() {
    return quota;
  }

  public void setQuota(Integer quota) {
    this.quota = quota;
  }

  public Integer getBookedCount() {
    return bookedCount;
  }

  public void setBookedCount(Integer bookedCount) {
    this.bookedCount = bookedCount;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public String getRemark() {
    return remark;
  }

  public void setRemark(String remark) {
    this.remark = remark;
  }
}
