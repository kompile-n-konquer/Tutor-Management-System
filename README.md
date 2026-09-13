# TutorFlow Project

Welcome to the TutorFlow repository! This document outlines our project architecture, Git workflow, database setup, local run instructions, and deployment processes.

## Team Members

- **Mogomotsi Motoma (2898909)**
- **Nduvho Mulaudzi (2801257)**
- **Kgaogelo Mohlala (2836959)**
- **Ndumiso Skhosana (2871037)**
- **Nhlamulo Mabuza (2819916)**
- **Tlhalefo Sebaeng (2575338)**

## Project Structure

```text
Tutor-Management-System/
├── README.md
├── .gitignore
├── .gitea/
│   └── workflows/
│       ├── deploy-docs.yml
│       └── test.yml
├── backend/
│   └── .gitkeep
├── docs/
│   ├── docs/
│   │   └── intro.mdx
│   ├── src/
│   │   ├── components/
│   │   │   └── HomepageFeatures/
│   │   │       ├── index.js
│   │   │       └── styles.module.css
│   │   ├── css/
│   │   │   └── custom.css
│   │   └── pages/
│   │       ├── index.js
│   │       ├── index.module.css
│   │       └── markdown-page.mdx
│   ├── static/
│   │   └── img/
│   ├── docusaurus.config.js
│   ├── package.json
│   ├── README.md
│   └── sidebars.js
└── frontend/
    ├── .gitignore
    ├── eslint.config.js
    ├── index.html
    ├── package.json
    ├── README.md
    ├── tsconfig.app.json
    ├── tsconfig.json
    ├── tsconfig.node.json
    ├── vite.config.ts
    ├── __tests__/
    │   └── placeholder.test.js
    ├── public/
    └── src/
        ├── App.css
        ├── App.tsx
        ├── assets/
        ├── index.css
        └── main.tsx
```

---

# Git Workflow & Contribution Rules

**CRITICAL:** The main branch is locked. **DO NOT push directly to main**. All code must go through a Pull Request (PR) and be approved by at least one team member.

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

### Step 4: Push to GitHub

```bash
git push -u origin <prefix>/<your-branch-name>
```

### Step 5: Open a Pull Request (PR)

1. Navigate to our Gitea repository and click "New Pull Request"
2. Add at least one team member as a Reviewer
3. Wait for approval. Once approved, click "Merge pull request"

---

# Database Setup (Prisma)

We are using Prisma ORM with a relational database. To run the backend locally, you must connect to the database instance.

1. **Add the Database URL:**
   Paste the connection string provided into your local `.env` configuration:
   ```env
   DATABASE_URL=""
   ```
2. **Generate the Prisma Client & Push Schema:**
   Run the following commands to synchronize your local application tier with the database specifications:
   ```bash
   npm install
   npx prisma generate
   npx prisma db push
   ```

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

Follow these step-by-step procedures to boot the server instance

### 1. Launching the Backend

### 2. Launching

# CI/CD Pipeline

## Runners

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

---

---

# Testing

To run the complete validation test suite locally before pushing or opening a Pull Request, run the following commands:

```bash
npm run test
npm run test -- --coverage
```
