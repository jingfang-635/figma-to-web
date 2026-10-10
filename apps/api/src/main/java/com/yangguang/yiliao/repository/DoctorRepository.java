package com.yangguang.yiliao.repository;

import com.yangguang.yiliao.entity.Doctor;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DoctorRepository extends JpaRepository<Doctor, Long> {
  long countByStatus(String status);
}
