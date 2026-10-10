package com.yangguang.yiliao.repository;

import com.yangguang.yiliao.entity.Department;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DepartmentRepository extends JpaRepository<Department, Long> {
  long countByStatus(String status);
}
