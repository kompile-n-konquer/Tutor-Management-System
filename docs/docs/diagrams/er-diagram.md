---
sidebar_position: 3
---

# System Design — Data Model (ER Diagram)

This reflects the current `schema.prisma`. All user roles (student, tutor, lecturer, organiser, admin) live on `User.role` — there are no separate role tables. It covers the application/waitlist flow, course assignment, timesheets, and overflow work.

```mermaid
erDiagram
  USER ||--o{ APPLICATION : "submits"
  USER ||--o{ COURSE : "teaches"
  USER ||--o{ TUTOR_ASSIGNMENT : "tutors"
  USER ||--o{ AVAILABILITY : "sets"
  USER ||--o{ BUSY_BLOCK : "blocks"
  USER ||--o{ TIMESHEET : "submits"
  USER ||--o{ OVERFLOW_WORK : "claims"

  COURSE ||--o{ APPLICATION : "receives"
  COURSE ||--o{ TUTOR_ASSIGNMENT : "has"
  COURSE ||--o{ COURSE_SLOT : "scheduled at"
  COURSE ||--o{ OVERFLOW_WORK : "posts"
  COURSE ||--o{ TIMESHEET_ENTRY : "logged against"

  TUTOR_ASSIGNMENT ||--o{ SESSION : "generates"
  COURSE_SLOT ||--o{ SESSION : "schedules"
  TIMESHEET ||--o{ TIMESHEET_ENTRY : "contains"
  TIME_SLOT ||--o{ AVAILABILITY : "used by"
  TIME_SLOT ||--o{ COURSE_SLOT : "used by"

  USER {
    int id PK
    string firebaseUid UK
    string studentNumber
    string employeeNumber
    string firstName
    string lastName
    string email UK
    string role "STUDENT, TUTOR, LECTURER, ORGANISER, ADMIN"
    boolean isActive
  }
  APPLICATION {
    int id PK
    int userId FK
    int courseId FK
    float courseMark
    string status "PENDING, WAITLISTED, APPROVED, REJECTED"
    datetime appliedAt
    datetime reviewedAt
  }
  COURSE {
    int id PK
    string courseCode UK
    string courseName
    float minimumMark
    int tutorsRequired
    boolean acceptingApplications
    datetime createdAt
    int userId FK "owning lecturer or organiser"
  }
  TUTOR_ASSIGNMENT {
    int id PK
    int userId FK
    int courseId FK
    string semester
  }
  AVAILABILITY {
    int id PK
    int userId FK
    int dayOfWeek
    int timeSlotId FK
  }
  BUSY_BLOCK {
    int id PK
    int userId FK
    int dayOfWeek
    int startMinute
    int endMinute
  }
  COURSE_SLOT {
    int id PK
    int courseId FK
    int dayOfWeek
    int timeSlotId FK
    string venue
    string sessionType
  }
  SESSION {
    int id PK
    int assignmentId FK
    int courseSlotId FK
    datetime date
    string status
    string excuseReason
  }
  TIMESHEET {
    int id PK
    int userId FK
    string payrollNumber
    float totalHours
    string status "DRAFT, SUBMITTED, APPROVED"
  }
  TIMESHEET_ENTRY {
    int id PK
    int timesheetId FK
    int courseId FK
    datetime workDate
    float duration
    string taskType
    boolean isApproved
  }
  OVERFLOW_WORK {
    int id PK
    int courseId FK
    string description
    int hours
    int postedBy
    int claimedBy FK
    string status
  }
  SYSTEM_SETTING {
    string key PK
    string value
    datetime updatedAt
  }
```

## Notes on modeling decisions

- **One `User` table, roles as a string**: `User.role` distinguishes student / tutor / lecturer / organiser / admin. There are no separate role tables — every tutor-role construct (availability, busy blocks, assignments, timesheets, overflow claims) references `User` directly, so a user's data survives role changes.
- **Waitlist is a status, not a new entity**: `Application.status` moves through `PENDING → WAITLISTED / APPROVED / REJECTED`. When an approved applicant declines or a `TutorAssignment` frees up, the next-ranked `WAITLISTED` application (ordered by `courseMark`) can be promoted to `APPROVED` without any schema change.
- **`TutorAssignment` is the join entity** between `User` (tutor role) and `Course`, carrying only the `semester` — the many-to-many relationship of which users tutor which courses. Hours are not stored: they are derived from the course's slots (each slot rounds up to at least one whole hour), and the overall cap lives in `SystemSetting` (`TUTOR_MONTHLY_CLAIMABLE_HOURS`, set by an organiser).
- **Availability vs `CourseSlot`**: a tutor's own weekly availability (`Availability`) is checked against each course's fixed teaching times (`CourseSlot`) to detect scheduling clashes — these are separate tables because tutors set availability once per term, while course slots are fixed by the timetable. Both reference the shared `TimeSlot` catalogue.
