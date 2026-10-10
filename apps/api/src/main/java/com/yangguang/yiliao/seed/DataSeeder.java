package com.yangguang.yiliao.seed;

import com.yangguang.yiliao.entity.Appointment;
import com.yangguang.yiliao.entity.AppUser;
import com.yangguang.yiliao.entity.Department;
import com.yangguang.yiliao.entity.Doctor;
import com.yangguang.yiliao.entity.Organization;
import com.yangguang.yiliao.entity.Schedule;
import com.yangguang.yiliao.repository.AppointmentRepository;
import com.yangguang.yiliao.repository.AppUserRepository;
import com.yangguang.yiliao.repository.DepartmentRepository;
import com.yangguang.yiliao.repository.DoctorRepository;
import com.yangguang.yiliao.repository.OrganizationRepository;
import com.yangguang.yiliao.repository.ScheduleRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class DataSeeder implements ApplicationRunner {

  private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

  private final AppUserRepository appUserRepository;
  private final OrganizationRepository organizationRepository;
  private final DepartmentRepository departmentRepository;
  private final DoctorRepository doctorRepository;
  private final ScheduleRepository scheduleRepository;
  private final AppointmentRepository appointmentRepository;
  private final PasswordEncoder passwordEncoder;

  @Value("${app.seed.admin-username:admin}")
  private String adminUsername;

  @Value("${app.seed.admin-password:}")
  private String adminPassword;

  public DataSeeder(
      AppUserRepository appUserRepository,
      OrganizationRepository organizationRepository,
      DepartmentRepository departmentRepository,
      DoctorRepository doctorRepository,
      ScheduleRepository scheduleRepository,
      AppointmentRepository appointmentRepository,
      PasswordEncoder passwordEncoder) {
    this.appUserRepository = appUserRepository;
    this.organizationRepository = organizationRepository;
    this.departmentRepository = departmentRepository;
    this.doctorRepository = doctorRepository;
    this.scheduleRepository = scheduleRepository;
    this.appointmentRepository = appointmentRepository;
    this.passwordEncoder = passwordEncoder;
  }

  /** Schedules the current month must hold for the calendar screen to be a real
   * table rather than an empty shell; below this the seed backfills. */
  private static final int MIN_SCHEDULES_IN_MONTH = 30;

  /** Days either side of today the backfill spreads schedules over, so the live
   * calendar has both recent and upcoming rows instead of a single day. */
  private static final int SCHEDULE_DAYS_BEFORE = 7;

  private static final int SCHEDULE_DAYS_AFTER = 21;

  @Override
  public void run(ApplicationArguments args) {
    seedAdmin();
    if (organizationRepository.count() == 0) {
      seedSampleData();
    } else {
      // Enrich thin DBs so dashboards have live series without wiping user data.
      enrichCatalogIfThin();
      if (appointmentRepository.count() < 50) {
        enrichAppointmentsIfThin();
      }
    }
    // A DB created before the schedule backfill existed still has an empty
    // calendar; the live-data contract is "no empty screen", so top it up
    // regardless of which branch above ran.
    enrichSchedulesIfThin();
  }

  private void seedAdmin() {
    if (!StringUtils.hasText(adminPassword)) {
      log.warn("GATE_PASS empty — skip admin seed");
      return;
    }
    if (appUserRepository.existsByUsername(adminUsername)) {
      return;
    }
    AppUser user = new AppUser();
    user.setUsername(adminUsername);
    user.setPasswordHash(passwordEncoder.encode(adminPassword));
    user.setRole("ADMIN");
    appUserRepository.save(user);
    log.info("Seeded admin user '{}'", adminUsername);
  }

  private void seedSampleData() {
    Organization org = new Organization();
    org.setName("阳光医疗门诊");
    org.setPhone("400-800-1222");
    org.setSubtitle("专业 · 贴心 · 高效");
    org.setBusinessHours("周一至周日 08:00-20:00");
    org.setAddress("示例市示例区阳光路 128 号");
    org.setDescription("阳光医疗门诊提供全科与专科预约挂号服务。");
    organizationRepository.save(org);

    String[][] deptDefs = {
      {"内科", "internal", "重症、发热、咳嗽等"},
      {"儿科", "pedia", "儿童常见病、生长发育"},
      {"妇科", "gyn", "妇科常规与专科门诊"},
      {"口腔科", "dental", "齿科检查与治疗"},
      {"皮肤科", "derm", "皮肤过敏与常见病"},
      {"外科", "surgery", "普外与门诊小手术"}
    };
    List<Department> departments = new ArrayList<>();
    for (int i = 0; i < deptDefs.length; i++) {
      Department d = new Department();
      d.setName(deptDefs[i][0]);
      d.setIcon(deptDefs[i][1]);
      d.setDescription(deptDefs[i][2]);
      d.setSortOrder(i + 1);
      d.setStatus("ENABLED");
      departments.add(departmentRepository.save(d));
    }

    String[][] doctorDefs = {
      {"张伟", "主任医师", "0", "高血压、糖尿病"},
      {"李娜", "副主任医师", "1", "儿童呼吸道感染"},
      {"王磊", "主任医师", "2", "妇科内分泌"},
      {"陈静", "主治医师", "3", "龋齿、牙周"},
      {"刘洋", "主治医师", "4", "湿疹、荨麻疹"},
      {"赵强", "副主任医师", "5", "普外科门诊"}
    };
    List<Doctor> doctors = new ArrayList<>();
    for (String[] def : doctorDefs) {
      Doctor doc = new Doctor();
      doc.setName(def[0]);
      doc.setTitle(def[1]);
      doc.setDepartmentId(departments.get(Integer.parseInt(def[2])).getId());
      doc.setFee(new BigDecimal("30.00").add(new BigDecimal(ThreadLocalRandom.current().nextInt(0, 6) * 10)));
      doc.setYearsExperience(8 + ThreadLocalRandom.current().nextInt(15));
      doc.setRating(new BigDecimal("95.00").add(new BigDecimal(ThreadLocalRandom.current().nextInt(0, 50)).movePointLeft(1)));
      doc.setSpecialty(def[3]);
      doc.setStatus("ACTIVE");
      doctors.add(doctorRepository.save(doc));
    }

    LocalDate today = LocalDate.now();
    List<Schedule> schedules = new ArrayList<>();
    for (int day = -SCHEDULE_DAYS_BEFORE; day <= SCHEDULE_DAYS_AFTER; day++) {
      LocalDate date = today.plusDays(day);
      for (Doctor doc : doctors) {
        if (ThreadLocalRandom.current().nextDouble() < 0.35) {
          continue;
        }
        schedules.add(scheduleRepository.save(randomSchedule(doc, date)));
      }
    }

    String[] statuses = {"COMPLETED", "COMPLETED", "COMPLETED", "BOOKED", "NO_SHOW", "CANCELLED"};
    int appointmentTarget = 120;
    for (int i = 0; i < appointmentTarget; i++) {
      Doctor doc = doctors.get(ThreadLocalRandom.current().nextInt(doctors.size()));
      LocalDate date = today.minusDays(ThreadLocalRandom.current().nextInt(0, 28));
      Appointment a = new Appointment();
      a.setDoctorId(doc.getId());
      if (!schedules.isEmpty() && ThreadLocalRandom.current().nextBoolean()) {
        Schedule s = schedules.get(ThreadLocalRandom.current().nextInt(schedules.size()));
        a.setScheduleId(s.getId());
        a.setDate(s.getDate());
      } else {
        a.setDate(date);
      }
      String status = statuses[ThreadLocalRandom.current().nextInt(statuses.length)];
      if (a.getDate().isEqual(today) && ThreadLocalRandom.current().nextBoolean()) {
        status = "BOOKED";
      }
      a.setStatus(status);
      BigDecimal amount =
          doc.getFee() != null
              ? doc.getFee()
              : new BigDecimal("40.00");
      if ("CANCELLED".equals(status)) {
        amount = BigDecimal.ZERO;
      }
      a.setAmount(amount.setScale(2, RoundingMode.HALF_UP));
      appointmentRepository.save(a);
    }

    log.info(
        "Seeded live sample data: depts={}, doctors={}, schedules={}, appointments~={}",
        departments.size(),
        doctors.size(),
        schedules.size(),
        appointmentTarget);
  }

  private void enrichCatalogIfThin() {
    if (departmentRepository.count() >= 6 && doctorRepository.count() >= 6) {
      return;
    }
    String[][] deptDefs = {
      {"内科", "internal", "重症、发热、咳嗽等"},
      {"儿科", "pedia", "儿童常见病、生长发育"},
      {"妇科", "gyn", "妇科常规与专科门诊"},
      {"口腔科", "dental", "齿科检查与治疗"},
      {"皮肤科", "derm", "皮肤过敏与常见病"},
      {"外科", "surgery", "普外与门诊小手术"}
    };
    List<Department> departments = new ArrayList<>(departmentRepository.findAll());
    for (int i = 0; i < deptDefs.length; i++) {
      String name = deptDefs[i][0];
      boolean exists =
          departments.stream().anyMatch((d) -> name.equals(d.getName()));
      if (exists) {
        continue;
      }
      Department d = new Department();
      d.setName(name);
      d.setIcon(deptDefs[i][1]);
      d.setDescription(deptDefs[i][2]);
      d.setSortOrder(i + 1);
      d.setStatus("ENABLED");
      departments.add(departmentRepository.save(d));
    }
    if (doctorRepository.count() >= 6) {
      return;
    }
    String[] names = {"张伟", "李娜", "王磊", "陈静", "刘洋", "赵强"};
    String[] titles = {"主任医师", "副主任医师", "主任医师", "主治医师", "主治医师", "副主任医师"};
    for (int i = 0; i < names.length; i++) {
      final String n = names[i];
      boolean exists = doctorRepository.findAll().stream().anyMatch((d) -> n.equals(d.getName()));
      if (exists || departments.isEmpty()) {
        continue;
      }
      Doctor doc = new Doctor();
      doc.setName(n);
      doc.setTitle(titles[i]);
      doc.setDepartmentId(departments.get(i % departments.size()).getId());
      doc.setFee(new BigDecimal("45.00"));
      doc.setYearsExperience(10);
      doc.setRating(new BigDecimal("97.00"));
      doc.setSpecialty("常见病");
      doc.setStatus("ACTIVE");
      doctorRepository.save(doc);
    }
    log.info("Enriched catalog departments/doctors");
  }

  /** One schedule row whose quota/booked mix reproduces the prototype's chip
   * states: mostly open, some fully booked, a few closed. */
  private Schedule randomSchedule(Doctor doc, LocalDate date) {
    String[] periods = {"MORNING", "AFTERNOON"};
    Schedule s = new Schedule();
    s.setDoctorId(doc.getId());
    s.setDate(date);
    s.setPeriod(periods[ThreadLocalRandom.current().nextInt(periods.length)]);
    int quota = 12 + ThreadLocalRandom.current().nextInt(39);
    double roll = ThreadLocalRandom.current().nextDouble();
    String status = "OPEN";
    int booked;
    if (roll < 0.12) {
      status = "CLOSED";
      booked = 0;
    } else if (roll < 0.35) {
      booked = quota;
    } else {
      booked = ThreadLocalRandom.current().nextInt(0, quota);
    }
    s.setQuota(quota);
    s.setBookedCount(booked);
    s.setStatus(status);
    return s;
  }

  /** Top up a thin schedule table so the calendar screen is never an empty
   * shell. A DB that predates this backfill keeps zero schedules otherwise,
   * because the catalog/appointment enrichment paths never touch schedules. */
  private void enrichSchedulesIfThin() {
    List<Doctor> doctors = doctorRepository.findAll();
    if (doctors.isEmpty()) {
      return;
    }
    LocalDate today = LocalDate.now();
    LocalDate monthStart = today.withDayOfMonth(1);
    LocalDate monthEnd = today.withDayOfMonth(today.lengthOfMonth());
    if (scheduleRepository.countByDateBetween(monthStart, monthEnd)
        >= MIN_SCHEDULES_IN_MONTH) {
      return;
    }
    LocalDate windowFrom = today.minusDays(SCHEDULE_DAYS_BEFORE);
    LocalDate windowTo = today.plusDays(SCHEDULE_DAYS_AFTER);
    java.util.Set<String> existing = new java.util.HashSet<>();
    for (Schedule s : scheduleRepository.findByDateBetween(windowFrom, windowTo)) {
      existing.add(s.getDoctorId() + "|" + s.getDate() + "|" + s.getPeriod());
    }
    String[] periods = {"MORNING", "AFTERNOON"};
    int created = 0;
    for (LocalDate date = windowFrom; !date.isAfter(windowTo); date = date.plusDays(1)) {
      for (Doctor doc : doctors) {
        for (String period : periods) {
          String key = doc.getId() + "|" + date + "|" + period;
          if (existing.contains(key)) {
            continue;
          }
          Schedule s = randomSchedule(doc, date);
          s.setPeriod(period);
          scheduleRepository.save(s);
          existing.add(key);
          created++;
        }
      }
    }
    log.info("Enriched schedules by {} rows for the live calendar", created);
  }

  private void enrichAppointmentsIfThin() {
    List<Doctor> doctors = doctorRepository.findAll();
    if (doctors.isEmpty()) {
      return;
    }
    LocalDate today = LocalDate.now();
    String[] statuses = {"COMPLETED", "COMPLETED", "BOOKED", "NO_SHOW", "CANCELLED"};
    int need = 80;
    for (int i = 0; i < need; i++) {
      Doctor doc = doctors.get(ThreadLocalRandom.current().nextInt(doctors.size()));
      Appointment a = new Appointment();
      a.setDoctorId(doc.getId());
      a.setDate(today.minusDays(ThreadLocalRandom.current().nextInt(0, 21)));
      String status = statuses[ThreadLocalRandom.current().nextInt(statuses.length)];
      a.setStatus(status);
      BigDecimal amount =
          doc.getFee() != null ? doc.getFee() : new BigDecimal("40.00");
      if ("CANCELLED".equals(status)) {
        amount = BigDecimal.ZERO;
      }
      a.setAmount(amount.setScale(2, RoundingMode.HALF_UP));
      appointmentRepository.save(a);
    }
    log.info("Enriched live appointments by ~{}", need);
  }
}
