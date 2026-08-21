---
sidebar_position: 2
---

# System Design — Component Diagram

This diagram shows the high-level architecture of the Tutor Management System: how the frontend, backend, database, and third-party services connect.

```mermaid
graph TD
  subgraph Client["Client (Browser)"]
    FE["Frontend App<br/>React — Vercel"]
  end

  subgraph Server["Application Server"]
    BE["Backend API<br/>Node.js — Azure App Service"]
  end

  subgraph Data["Data Layer"]
    DB[("SQL Server DB<br/>via Prisma ORM")]
  end

  AUTH["Firebase Auth"]
  EXT["External API<br/>(TBD — planned integration)"]

  FE -- "REST/HTTPS<br/>hand-written API" --> BE
  BE -- "Prisma queries" --> DB
  FE -- "sign up / sign in / token" --> AUTH
  BE -- "verifies Firebase ID token" --> AUTH
  BE -. "planned" .-> EXT

  classDef client fill:#E6F1FB,stroke:#185FA5,color:#0C447C;
  classDef server fill:#E1F5EE,stroke:#0F6E56,color:#085041;
  classDef data fill:#FAEEDA,stroke:#854F0B,color:#633806;
  classDef ext fill:#F1EFE8,stroke:#5F5E5A,color:#2C2C2A,stroke-dasharray: 4 3;

  class FE client;
  class BE server;
  class DB data;
  class AUTH,EXT ext;
```

## Notes

- **Non-monolithic split**: the frontend (React, deployed on Vercel) and backend (Node.js, deployed on Azure App Service) are separate deployable applications, communicating only over a hand-written REST API — satisfying the course's non-monolithic architecture requirement.
- **Auth**: Firebase Auth is used as an established authentication library, not a self-built system. The frontend handles sign-up/sign-in directly against Firebase; the backend verifies the resulting Firebase ID token on each request to identify the user and their role.
- **External API integration**: not yet decided at MS1 — the connection point is drawn here as planned/dashed to acknowledge the requirement exists, and will be filled in once the specific service is chosen (e.g. a timetable/calendar service).
- **Database**: SQL Server, accessed exclusively through Prisma ORM from the backend — the frontend never talks to the database directly.
