# TutorFlow — Tutor Management System

TutorFlow is a web-based Tutor Management System that coordinates tutors, lecturers, and organisers
within a school of mathematics and statistics. It handles course assignments, session scheduling,
cover requests, timesheets, and analytics — all in real time via Socket.IO.

## Team Members

- **Mogomotsi Motoma (2898909)**
- **Nduvho Mulaudzi (2801257)**
- **Kgaogelo Mohlala (2836959)**
- **Ndumiso Skhosana (2871037)**
- **Nhlamulo Mabuza (2819916)**
- **Tlhalefo Sebaeng (2575338)**

## Tech Stack

| Layer       | Technology                                        |
|-------------|---------------------------------------------------|
| Frontend    | React 19, Vite 8, Tailwind CSS 4, Socket.IO Client |
| Backend     | Node.js 20+, Express 5, Prisma 6, Socket.IO      |
| Database    | SQL Server (Azure or local Docker container)      |
| Auth        | Firebase Authentication (Google provider)         |
| Email       | Resend                                            |
| Docs        | Docusaurus 3                                      |
| CI/CD       | Gitea Actions → Azure App Service + Vercel        |

## Prerequisites

- **Node.js 22 LTS** (20.19+ or 22.12+ required by Vite 8). Use `nvm` to manage versions.
- **npm** (ships with Node.js)
- **Docker Desktop** — only needed if running the database locally
- A Firebase project with Authentication enabled (Google provider)

---

## Project Structure

```text
Tutor-Management-System/
├── backend/
│   ├── __tests__/            # Jest test suites
│   ├── controllers/          # Express route handlers
│   ├── email/                # Resend email templates & notifier
│   ├── firebase/             # Firebase Admin SDK init
│   ├── middleware/            # Auth, upload middleware
│   ├── prisma/
│   │   ├── migrations/       # Committed Prisma migrations
│   │   ├── schema.prisma     # Database schema (single source of truth)
│   │   ├── seed.js           # Seed data script
│   │   └── client.js         # Prisma singleton
│   ├── realtime/             # Socket.IO server setup & event emitters
│   ├── routes/               # Express route definitions
│   ├── utils/                # Claim rules, roles, settings helpers
│   ├── docker-compose.yml    # Local SQL Server container
│   ├── index.js              # Express app entry point
│   └── package.json
├── docs/
│   ├── docs/                 # Docusaurus content pages (.mdx)
│   ├── src/                  # Custom components, CSS, pages
│   ├── static/               # Images, meeting notes
│   ├── docusaurus.config.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/       # Shared UI components (layout, common)
│   │   ├── config/           # navConfig, theme
│   │   ├── features/         # Feature modules (dashboard, cover, etc.)
│   │   ├── firebase/         # Firebase client SDK config
│   │   ├── hooks/            # Custom React hooks
│   │   ├── Router.jsx        # Route definitions
│   │   └── App.jsx           # Root component
│   ├── .example.env          # Template for Firebase env vars
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── .gitea/workflows/         # CI/CD pipelines
└── README.md
```

---

# Git Workflow & Contribution Rules

**CRITICAL:** The `main` branch is locked. **DO NOT push directly to `main`**. All code must go through a Pull Request (PR) and be approved by at least one team member.

### Step 1: Start with the freshest code

Always pull the latest changes before adding a new feature or doing a chore:

```bash
git checkout main
git pull origin main
```

### Step 2: Create a new branch

Use the correct prefix for your task:

- `feat/` for new user stories/features
- `chore/` for setup/infrastructure
- `fix/` for bug fixes

```bash
git checkout -b <prefix>/<your-branch-name>
```

### Step 3: Write code, save, and commit

Write clear, concise commit messages:

```bash
git add .
git commit -m "feat/chore/fix: clear description of what you did"
```

### Step 4: Push to Gitea

```bash
git push -u origin <prefix>/<your-branch-name>
```

### Step 5: Open a Pull Request (PR)

1. Navigate to our Gitea repository and click "New Pull Request"
2. Add at least one team member as a Reviewer
3. Wait for approval. Once approved, click "Merge pull request"

---

# Database Setup (Prisma)

The backend uses **Prisma ORM** with SQL Server. To run the backend locally you need a database
connection. You can either use the shared Azure SQL instance (ask a teammate for the connection
string) or spin up a local Docker container — see **Running the Project Locally** above.

After setting `DATABASE_URL` in `backend/.env`:

```bash
cd backend
npm install
npx prisma generate       # Generate the Prisma client
npx prisma migrate deploy # Apply schema to your database
npm run seed              # Seed sample data (optional)
```

> **Important:** Only ever run `prisma migrate dev` against your own local database — never against
> the shared Azure instance. `migrate dev` can prompt for destructive resets.

---

# SonarQube Setup & Scan Guide

This guide walks you through setting up SonarQube from scratch. Please scan the code on your branch before creating a new pull request before creating a new pull request. This guide will also help all the members to run the scanner on branches that the pull requests are made from before approving them

1. **Prerequisites**
   Make sure you have the following installed before starting:
   - Docker Desktop
   - Node.js (v18+)
     You will also need:
   - A **project key** (unique identifier for this project in SonarQube)
   - A **SonarQube token** (used to authenticate the scanner — treat this like a password)
     If you don't have these yet, they are generated in Step 3 below.

2. **Start the SonarQube Server**

   Run SonarQube locally using Docker:

   ```bash
   docker run -d --name sonarqube -p 9000:9000 sonarqube:community
   ```

   Wait about 1–2 minutes for it to fully start, then open:

   👉 [http://localhost:9000](http://localhost:9000)

   **Default login (first time only):**
   - Username: `admin`
   - Password: `admin`

   You'll be prompted to set a new password on first login.

   > To stop/start the server later without losing data:
   >
   > ```bash
   > docker stop sonarqube
   > docker start sonarqube
   > ```

3. **Create a Project and Token**
   1. In the SonarQube UI, click **Create Project → Local Project**.
   2. Enter a **Project Key** and **Display Name** (e.g. `my-project`).
   3. Choose **Use the global setting** for the main branch, then click **Create Project**.
   4. On the setup screen, choose **Locally** as the analysis method.
   5. Generate a **token**:
      - Give it a name (e.g. `local-scan-token`)
      - Set an expiration (or "No expiration" for local dev use)
      - Click **Generate**
   6. **Copy the token immediately** — SonarQube will not show it to you again.

   Keep this project key and token handy — you'll use them in Step 4.

4. **Run a Local Scan**

Set environment variables, then run the scan.

**Command Prompt (cmd):**

```cmd
set SONAR_TOKEN=your_token_here
set SONAR_HOST_URL=http://localhost:9000
set SONAR_PROJECT_NAME=project_display_name
node sonar.js
```

**PowerShell:**

```powershell
$env:SONAR_TOKEN="your_token_here"
$env:SONAR_HOST_URL="http://localhost:9000"
$env:SONAR_PROJECT_NAME="project_display_name"
node sonar.js
```

**macOS/Linux:**

```bash
export SONAR_TOKEN=your_token_here
export SONAR_HOST_URL=http://localhost:9000
export SONAR_PROJECT_NAME=project_display_name
node sonar.js
```

A successful run ends with `EXECUTION SUCCESS` in the terminal

5. View the Results

Open your browser to:

```
http://localhost:9000/dashboard?id=YOUR_PROJECT_KEY
```

---

# Running the Project Locally

## 1. Clone and install dependencies

```bash
git clone https://sdp.ms.wits.ac.za/kompile-n-konquer/Tutor-Management-System.git
cd Tutor-Management-System

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# (Optional) Install docs dependencies
cd ../docs
npm install
```

## 2. Configure environment variables

### Backend (`backend/.env`)

Create a `backend/.env` file with the following variables:

```env
# Database — use the shared Azure SQL string, or a local Docker container
DATABASE_URL="sqlserver://localhost:1433;database=Tutor_DB;user=sa;password=Tutor-pass;trustServerCertificate=true"

# Firebase Admin SDK (server-side token verification)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"

# Server
SERVER_PORT=3001
CORS_ALLOWED_ORIGINS=http://localhost:5173

# Email (optional — only needed for notification features)
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=noreply@your-domain.com
```

### Frontend (`frontend/.env`)

Copy `frontend/.example.env` to `frontend/.env` and fill in your Firebase web-app credentials:

```bash
cp frontend/.example.env frontend/.env
```

```env
VITE_FIREBASE_API_KEY=your-actual-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

## 3. Set up the database

You can either use the **shared Azure SQL database** (ask a teammate for the connection string)
or run a **local SQL Server container**:

```bash
# From the backend/ directory
cd backend
docker compose up -d            # Start local SQL Server on localhost:1433
npx prisma migrate deploy       # Apply schema migrations
npx prisma generate             # Generate the Prisma client
npm run seed                    # Seed sample data (optional)
```

> See `backend/LOCAL_DB_SETUP.md` for troubleshooting and reset instructions.

## 4. Start the development servers

Open **two terminals** — one for the backend, one for the frontend:

```bash
# Terminal 1 — Backend (Express API on port 3001)
cd backend
npm run dev

# Terminal 2 — Frontend (Vite dev server on port 5173)
cd frontend
npm run dev
```

The app will be available at **http://localhost:5173**.

## 5. Preview the documentation site (optional)

```bash
cd docs
npm run start
```

Opens at **http://localhost:3000** with hot reload.

---

# Testing

Run the full test suites before pushing or opening a Pull Request.

### Backend (Jest)

```bash
cd backend
npm test                  # Run all backend tests
npm run test:coverage     # With coverage report
```

### Frontend (Vitest)

```bash
cd frontend
npm test                  # Run all frontend tests
npm run test:coverage     # With coverage report (enforces 90% gate)
```

---

# CI/CD Pipeline

Our CI/CD pipelines run on **Gitea Actions**, which — unlike GitHub Actions — does not provide free
hosted runners. Jobs only execute while a registered runner is online.

- **Current runner:** hosted on Nduvho's machine. If it's offline (laptop asleep/closed), any pending
  PR checks or docs deploys will show as **"Waiting to run"** until it reconnects.
- **Starting the runner:** run `./act_runner daemon` from wherever `act_runner` is installed, and leave
  the process running.
- **Adding another runner:** anyone can register a second runner from Repo Settings → Actions →
  Runners → Create new Runner, to reduce this single point of failure. Not required for the pipeline
  to work, but recommended if "Waiting to run" stalls become frequent.

## Application Deployment

The repository is configured for automated deployment to MS Azure.

- **Trigger:** The CI/CD pipeline is triggered automatically via Gitea Actions whenever a Pull Request is successfully merged into the `main` branch.
- **Testing:** The pipeline will first execute our Vitest automated verification scripts. If any validation step returns a fault, **the deployment sequence will be blocked automatically**.
- **Deployment:** If the verification scripts complete without issue, the structural additions are safely compiled, packed, and released into our live Azure App Service environment.

## Updating the Documentation

The documentation site is a Docusaurus project located in the `docs/` folder. Any push to `main` that
changes files under `docs/` automatically rebuilds and redeploys the live site — no manual deploy step
needed.

### Making a change

1. **Install dependencies (first time only):**

```bash
   cd docs
   npm install
```

This installs all the packages Docusaurus needs. You only need to run this once, or again if
`package.json` has changed since your last install.

2. **Preview locally before pushing:**

```bash
   cd docs
   npm run start
```

This opens the site at `http://localhost:3000` with hot reload, so you can see edits as you make them.

3. **Edit the relevant file:**
   - Docs content pages → `docs/docs/*.md` or `*.mdx`
   - Sidebar order/structure → `docs/sidebars.js`
   - Site config (title, navbar, links) → `docs/docusaurus.config.js`
   - Homepage → `docs/src/pages/index.js`

4. **Follow the standard branch workflow** (see Git Workflow above — do not push directly to `main`):

```bash
   git checkout -b feat/docs-<short-description>
   git add .
   git commit -m "feat: <what you changed>"
   git push -u origin feat/docs-<short-description>
```

5. **Open a PR, get it reviewed and merged.** Once merged into `main`, the docs deploy workflow picks it
   up automatically and the live site updates within a couple of minutes.

### Adding a new page

Create a new `.md` or `.mdx` file in `docs/docs/`, add frontmatter at the top (e.g. `sidebar_position: 2`),
and it will appear in the sidebar automatically. To control its position or grouping manually, edit
`docs/sidebars.js`.
