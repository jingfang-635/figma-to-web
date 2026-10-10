package com.yangguang.yiliao.repository;

import com.yangguang.yiliao.entity.Appointment;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AppointmentRepository extends JpaRepository<Appointment, Long> {

  long countByDateBetween(LocalDate start, LocalDate end);

  @Query(
      "select coalesce(sum(a.amount), 0) from Appointment a where a.date between :start and :end")
  BigDecimal sumAmountByDateBetween(@Param("start") LocalDate start, @Param("end") LocalDate end);
}
