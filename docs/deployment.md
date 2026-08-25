# Deployment Documentation

This document describes the Azure infrastructure backing the Tutor Management System, and how to redeploy manually if the CD pipeline breaks.

## What Exists

**Resource Group:** `TutorM_group` (Spain Central)

| Resource | Type | Name |
|---|---|---|
| SQL Server | Azure SQL logical server | `komnkon` |
| SQL Database | Azure SQL database | `Tutor_DB` |
| App Service | Azure App Service | `TutorManagement` |

**Server details:**
- Server hostname: `komnkon.database.windows.net`
- Database name: `Tutor_DB`
- SQL admin login: `CloudSA67733bae`
- Authentication: Mixed mode (both Microsoft Entra ID and SQL authentication are supported — "Support only Microsoft Entra authentication" was **disabled** to allow Prisma to connect via SQL login)
- Entra admin: `2801257@students.wits.ac.za`
- Public network access: **Enabled** (was previously set to Deny Public Network Access, which blocked all external connections including Prisma; this was changed to allow connections)

## Credentials & Secrets

The following secrets must be configured as **repository-level** Gitea Actions secrets under `Repo → Settings → Actions → Secrets`:

| Secret | Purpose | How to obtain |
|---|---|---|
| `DATABASE_URL` | Prisma connection string to Azure SQL | See format below. |
| `AZURE_WEBAPP_PUBLISH_PROFILE` | Publish-profile deployment to `TutorManagement` | Azure Portal → App Service → **Get publish profile** |
| `AZURE_CREDENTIALS` | Service principal JSON for `azure/login` and `azure/CLI` | Run the `az ad sp create-for-rbac` command below. |

### `DATABASE_URL` format
```
sqlserver://komnkon.database.windows.net:1433;database=Tutor_DB;user=CloudSA67733bae;password=<password>;encrypt=true;trustServerCertificate=false;connectionTimeout=30
```

> **Note:** `DATABASE_URL` must be a **repository-level** secret, not a user-level secret, so the CD workflow can access it.

### Creating `AZURE_CREDENTIALS`

The workflow uses the Azure CLI to set App Service configuration (e.g. `DATABASE_URL`), which requires a service principal login. Create it once with:

```bash
az ad sp create-for-rbac \
  --name "TutorManagementDeploy" \
  --role contributor \
  --scopes /subscriptions/<subscription-id>/resourceGroups/TutorM_group \
  --sdk-auth
```

Paste the resulting JSON output into a Gitea secret named `AZURE_CREDENTIALS`.

If you do not have permission to create a service principal, you can skip the `Set Azure App Service settings` step and manually add `DATABASE_URL` in the Azure Portal under **App Service → Configuration → Application settings** before running the workflow.

## Prisma Setup

- Backend project: `backend/`
- Prisma schema: `backend/prisma/schema.prisma`
- Provider: `sqlserver`
- To push schema changes to the database:
  ```bash
  cd backend
  npx prisma db push
  ```

## Manual Redeploy Steps (if CD breaks)

If the automated Gitea Actions CD pipeline fails, follow these steps to manually verify or redeploy:

### 1. Verify the App Service is reachable
- Azure Portal → `TutorM_group` → `TutorManagement` (App Service)
- Check **Overview** for status (should be "Running")
- Visit the app's default URL to confirm it's serving requests

### 2. Verify database connectivity
- Azure Portal → `komnkon` (SQL Server) → **Networking**
- Confirm **Public network access** is enabled (not "Deny")
- Confirm your IP (or the relevant CI runner IP range) is allowed under firewall rules

### 3. Push schema manually
```bash
cd backend
# Ensure .env has a valid DATABASE_URL (see Credentials & Secrets above)
npx prisma db push
```

### 4. Redeploy the app manually
- If deploying via Gitea Actions normally, check the failed workflow run under the repo's **Actions** tab for the specific error first
- For a manual deploy fallback, use the Azure Portal's **Deployment Center** on the `TutorManagement` App Service, or deploy via `az webapp deploy` from the Azure CLI if configured locally

### 5. Common issues & fixes

| Symptom | Likely Cause | Fix |
|---|---|---|
| `Login failed for user` | Wrong username/password, or Entra-only auth re-enabled | Confirm SQL auth is still enabled on server; reset password if needed |
| `Deny Public Network Access` error | Public network access disabled on SQL server | Set to "Selected networks" or "Enabled from all networks" in server Networking settings |
| Connection timeout | Firewall rule missing for your IP or CI runner IP | Add IP under SQL Server → Networking → Firewall rules |
| Secret not found in workflow | `DATABASE_URL` added as user-level secret instead of repo-level | Repo Owner/Admin must add it under repo Settings → Actions → Secrets |

## Open Items / Follow-ups

- [x] Move `DATABASE_URL` from user-level to repository-level Gitea secret
- [ ] Confirm production DB schema push succeeds end-to-end via CD (not just manually)
- [ ] Review whether "Deny Public Network Access" should be re-enabled with tighter "Selected networks" scoping for production security, now that dev/CD access has been confirmed to work
- [ ] Verify `AZURE_CREDENTIALS` service principal secret is added to Gitea and has Contributor access to `TutorM_group`