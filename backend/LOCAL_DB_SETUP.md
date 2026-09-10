# Local database setup

We hit a wall this week where the shared Azure SQL Server ran out of
free-tier credits, which blocked migration work entirely. To avoid
that happening again, everyone should be able to run a local database
and not depend on the shared one for day-to-day development.

## First-time setup

1. Install Docker Desktop if you don't have it.
2. From the `backend/` folder, start the local database:
   ```
   docker compose up -d
   ```
   This starts a SQL Server 2022 container on `localhost:1433`.
3. Paste the newly shared DATABASE_URL to `.env, comment out the one for the live db
4. Apply the existing migrations to your fresh local DB:
   ```
   npx prisma migrate deploy
   ```
5. Generate the Prisma client:
   ```
   npx prisma generate
   ```

You're now working against your own local database. Feel free to run
`npx prisma migrate dev` freely here while building features — it's
your own throwaway instance, nothing shared is at risk.

## Viewing tables / data

To browse tables and rows in the browser:
```
npx prisma studio
```
Opens at `localhost:5555`, reading from whatever `DATABASE_URL` is
active in your `.env`. Good for a quick look at what's in a table;
for inspecting constraints/indexes/FKs, use a proper SQL client like
Azure Data Studio or the VS Code "SQL Server (mssql)" extension
instead, connecting to `localhost,1433` with the `sa` credentials
from `docker-compose.yml` (trust server certificate: true).

## When the shared Azure DB is back

- Keep your `.env`'s local `DATABASE_URL` as your default for day-to-day
  work.
- Only point at the shared DB deliberately (e.g. to test against staging),
  and only ever run `prisma migrate deploy` against it — never `migrate dev`.
  `deploy` applies existing committed migrations only; `dev` can generate
  new ones and prompt for destructive resets, which isn't safe on a
  database other people rely on.

## Troubleshooting: container starts but Prisma can't connect (P1001)

If `docker compose up -d` reports the container as "Started" but `prisma
migrate deploy`/`dev` fails with `P1001: Can't reach database server`,
check `docker ps` — if the PORTS column doesn't show
`0.0.0.0:1433->1433/tcp` (just `1433/tcp` with nothing mapped), the
container didn't get its port published, usually because a previous
`up` attempt partially failed (e.g. port already in use) and Compose
reused the broken container on a later `up -d` instead of recreating
it. Fix:
```
docker compose down
docker compose up -d --force-recreate
```
Then check `docker ps` again for the `0.0.0.0:1433->1433/tcp` mapping
before retrying Prisma. Your data is safe across this — it lives in
the `mssql-data` volume, which `down` doesn't remove.

## Resetting your local DB

If your local DB gets into a weird state, it's disposable:
```
npx prisma migrate reset --skip-seed
```
This drops and recreates it from the committed migrations. Safe to do
anytime locally — it only touches your own Docker container.
