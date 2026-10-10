package com.yangguang.yiliao.controller;

import com.yangguang.yiliao.repository.AppointmentRepository;
import com.yangguang.yiliao.repository.DepartmentRepository;
import com.yangguang.yiliao.repository.DoctorRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stats")
public class StatsController {

  private final DepartmentRepository departmentRepository;
  private final DoctorRepository doctorRepository;
  private final AppointmentRepository appointmentRepository;

  public StatsController(
      DepartmentRepository departmentRepository,
      DoctorRepository doctorRepository,
      AppointmentRepository appointmentRepository) {
    this.departmentRepository = departmentRepository;
    this.doctorRepository = doctorRepository;
    this.appointmentRepository = appointmentRepository;
  }

  @GetMapping
  public Map<String, Object> stats() {
    YearMonth month = YearMonth.now();
    LocalDate start = month.atDay(1);
    LocalDate end = month.atEndOfMonth();
    BigDecimal revenue = appointmentRepository.sumAmountByDateBetween(start, end);
    if (revenue == null) {
      revenue = BigDecimal.ZERO;
    }

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("enabledDepartmentCount", departmentRepository.countByStatus("ENABLED"));
    result.put("activeDoctorCount", doctorRepository.countByStatus("ACTIVE"));
    result.put("monthAppointmentCount", appointmentRepository.countByDateBetween(start, end));
    result.put("monthRevenue", revenue);
    return result;
  }
}
