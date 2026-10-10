package com.yangguang.yiliao.repository;

import com.yangguang.yiliao.entity.Schedule;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ScheduleRepository extends JpaRepository<Schedule, Long> {

  long countByDateBetween(LocalDate from, LocalDate to);

  List<Schedule> findByDateBetween(LocalDate from, LocalDate to);
}
