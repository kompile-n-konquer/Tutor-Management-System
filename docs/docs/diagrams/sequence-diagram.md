---
sidebar_position: 4
---

# System Design — Sequence Diagram: Assigning a Tutor to a Course

This shows the core Basic-tier flow: a lecturer assigns a tutor to a course from the allocation board, with all three validation checks (marks, timetable clash, remaining hours) run server-side through **one combined validation endpoint**.

```mermaid
sequenceDiagram
  actor L as Lecturer
  participant FE as Frontend (Board)
  participant BE as Backend API
  participant DB as Database

  L->>FE: Select tutor for course, click "Assign"
  FE->>BE: POST /assignments/validate {tutorId, courseId}

  BE->>DB: Get Application.courseMark for (tutorId, courseId)
  DB-->>BE: courseMark
  BE->>DB: Get Course.minimumMark
  DB-->>BE: minimumMark

  BE->>DB: Get Tutor.currentHours, maxHoursPerWeek
  DB-->>BE: hours data

  BE->>DB: Get Tutor.Availability + Course.CourseSlot
  DB-->>BE: availability, slot times

  Note over BE: Run all 3 checks:<br/>marksOk, hoursOk, clashOk

  BE-->>FE: 200 {marksOk, hoursOk, clashOk}

  alt All checks pass
    FE-->>L: Show green — ready to confirm
    L->>FE: Click "Confirm"
    FE->>BE: POST /assignments {tutorId, courseId, allocatedHours}
    BE->>DB: Re-validate + create TutorAssignment
    DB-->>BE: Assignment created
    BE-->>FE: 201 Created
    FE-->>L: Board updates, assignment visible
  else Any check fails
    FE-->>L: Show red flag(s) on the failing check(s)<br/>inline, before saving
  end
```

## Notes

- **One combined endpoint** (`POST /assignments/validate`) runs all three checks server-side in a single request/response cycle, rather than three separate calls or purely client-side checks. This keeps the validation logic centralized and easy to test (directly satisfies the automated API testing rubric line).
- **Live feedback**: the check runs as soon as the lecturer selects a tutor and clicks "Assign" — before anything is saved — satisfying the brief's requirement that a broken choice be "visible as it is made, not after it is saved."
- **Two-step confirm**: a final `POST /assignments` re-validates server-side at the moment of actual commit, guarding against race conditions (e.g. two lecturers assigning the same tutor to different courses at the same time, both passing the initial check).
