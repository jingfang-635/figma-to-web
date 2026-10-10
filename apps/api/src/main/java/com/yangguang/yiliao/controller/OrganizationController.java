package com.yangguang.yiliao.controller;

import com.yangguang.yiliao.entity.Organization;
import com.yangguang.yiliao.repository.OrganizationRepository;
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
@RequestMapping("/api/organizations")
public class OrganizationController {

  private final OrganizationRepository repository;

  public OrganizationController(OrganizationRepository repository) {
    this.repository = repository;
  }

  @GetMapping
  public List<Organization> list() {
    return repository.findAll();
  }

  @GetMapping("/{id}")
  public Organization get(@PathVariable Long id) {
    return repository
        .findById(id)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public Organization create(@RequestBody Organization body) {
    body.setId(null);
    return repository.save(body);
  }

  @PutMapping("/{id}")
  public Organization update(@PathVariable Long id, @RequestBody Organization body) {
    Organization existing =
        repository
            .findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    existing.setName(body.getName());
    existing.setPhone(body.getPhone());
    existing.setSubtitle(body.getSubtitle());
    existing.setBusinessHours(body.getBusinessHours());
    existing.setAddress(body.getAddress());
    existing.setDescription(body.getDescription());
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
