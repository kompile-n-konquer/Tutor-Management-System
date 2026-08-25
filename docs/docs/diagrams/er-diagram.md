---
sidebar_position: 3
---

# System Design — Data Model (ER Diagram)

This reflects the current `schema.prisma`. It covers three user roles (student, tutor, lecturer via `User.role`), the application/waitlist flow, course assignment, timesheets, and overflow work.

```mermaid
erDiagram
  USER ||--o| TUTOR : "becomes"
  USER ||--o| LECTURER : "is"
  USER ||--o{ APPLICANT : "applies as"

  LECTURER ||--o{ COURSE : "teaches"
  COURSE ||--o{ APPLICANT : "receives"
  COURSE ||--o{ TUTOR_ASSIGNMENT : "has"
  COURSE ||--o{ COURSE_SLOT : "scheduled at"
  COURSE ||--o{ OVERFLOW_WORK : "posts"
  COURSE ||--o{ TIMESHEET_ENTRY : "logged against"

  TUTOR ||--o{ TUTOR_ASSIGNMENT : "assigned to"
  TUTOR ||--o{ AVAILABILITY : "sets"
  TUTOR ||--o{ TIMESHEET : "submits"
  TUTOR ||--o{ OVERFLOW_WORK : "claims"

  TUTOR_ASSIGNMENT ||--o{ SESSION : "generates"
  TIMESHEET ||--o{ TIMESHEET_ENTRY : "contains"

  USER {
    int id PK
    string firebaseUid UK
    string studentNumber
    string employeeNumber
    string email UK
    string role
    boolean isActive
  }
  APPLICANT {
    int id PK
    int userId FK
    int courseId FK
    float courseMark
    string status "PENDING, WAITLISTED, ACCEPTED, REJECTED"
    datetime appliedAt
  }
  LECTURER {
    int id PK
    int userId FK
    string department
  }
  COURSE {
    int id PK
    string courseCode UK
    float minimumMark
    int lecturerId FK
  }
  TUTOR {
    int id PK
    int userId FK
    int maxHoursPerWeek
    int currentHours
    string status
  }
  TUTOR_ASSIGNMENT {
    int id PK
    int tutorId FK
    int courseId FK
    int allocatedHours
    string status
  }
  AVAILABILITY {
    int id PK
    int tutorId FK
    string dayOfWeek
    datetime startTime
    datetime endTime
  }
  COURSE_SLOT {
    int id PK
    int courseId FK
    int dayOfWeek
    int startMinute
    int endMinute
  }
  SESSION {
    int id PK
    int assignmentId FK
    datetime date
    string status
    string excuseReason
  }
  TIMESHEET {
    int id PK
    int tutorId FK
    float totalHours
    string status "DRAFT, SUBMITTED, APPROVED"
  }
  TIMESHEET_ENTRY {
    int id PK
    int timesheetId FK
    int courseId FK
    datetime workDate
    float duration
    boolean isApproved
  }
  OVERFLOW_WORK {
    int id PK
    int courseId FK
    int postedBy
    int claimedBy FK
    string status
  }
```

## Notes on modeling decisions

- **Three roles, one `User` table**: `User.role` distinguishes student / tutor / lecturer, with `Tutor` and `Lecturer` as optional 1-to-1 extension tables holding role-specific fields (hours, department). A student who hasn't applied yet has neither.
- **Waitlist is a status, not a new entity**: `Applicant.status` moves through `PENDING → WAITLISTED / ACCEPTED / REJECTED`. When an accepted applicant declines or a `TutorAssignment` frees up, the next-ranked `WAITLISTED` applicant (ordered by `courseMark`) can be promoted to `ACCEPTED` without any schema change.
- **`TutorAssignment` is the join entity** between `Tutor` and `Course`, carrying `allocatedHours` and `status` — this is where the three live-validation checks (marks, clash, hours) get enforced before a row is created.
- **Availability vs `CourseSlot`**: a tutor's own weekly availability (`Availability`) is checked against each course's fixed teaching times (`CourseSlot`) to detect scheduling clashes — these are separate tables because tutors set availability once per term, while course slots are fixed by the timetable.
