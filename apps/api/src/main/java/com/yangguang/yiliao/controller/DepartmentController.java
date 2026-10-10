package com.yangguang.yiliao.controller;

import com.yangguang.yiliao.entity.Department;
import com.yangguang.yiliao.repository.DepartmentRepository;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/departments")
public class DepartmentController {

  private final DepartmentRepository repository;

  public DepartmentController(DepartmentRepository repository) {
    this.repository = repository;
  }

  @GetMapping
  public List<Department> list() {
    return repository.findAll();
  }

  @GetMapping("/{id}")
  public Department get(@PathVariable Long id) {
    return repository
        .findById(id)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public Department create(@RequestBody Department body) {
    body.setId(null);
    return repository.save(body);
  }

  @PutMapping("/{id}")
  public Department update(@PathVariable Long id, @RequestBody Department body) {
    Department existing =
        repository
            .findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    existing.setName(body.getName());
    existing.setIcon(body.getIcon());
    existing.setDescription(body.getDescription());
    existing.setSortOrder(body.getSortOrder());
    existing.setStatus(body.getStatus());
    return repository.save(existing);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable Long id) {
    if (!repository.existsById(id)) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    }
    repository.deleteById(id);
  }
}
