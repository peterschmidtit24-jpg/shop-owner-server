# Supabase PostgreSQL Setup for Shop Owner Server

This guide connects the Shop Owner Express/Prisma server to a PostgreSQL database hosted by Supabase. The React client must continue to call the Express API; it must never connect with the PostgreSQL credentials directly.

## Architecture

```text
React client
    |
    | HTTP requests
    v
Express server
    |
    | Prisma
    v
Supabase PostgreSQL
```

Only the database is hosted by Supabase. During development, the Express server still runs locally at `http://localhost:8080`.

## Prerequisites

- A Supabase account and organization
- Node.js and npm
- The dependencies installed in `shop-owner-server`
- PostgreSQL command-line tools (`pg_dump` and `pg_restore`) only if local data must be transferred

Install the server dependencies if necessary:

```bash
cd shop-owner-server
npm install
```

## 1. Create a Supabase project

1. Open the Supabase dashboard.
2. Select the organization.
3. Choose **New project**.
4. Enter a project name, for example `shop-owner`.
5. Generate a strong database password and save it in a password manager.
6. Select a region close to the server deployment location, for example Frankfurt.
7. Wait until Supabase finishes provisioning the project.

An organization alone does not contain a database. Supabase creates the PostgreSQL database as part of a project.

## 2. Copy the Prisma connection strings

In the Supabase project, select **Connect > ORM > Prisma**.

Copy these two connection strings:

- Transaction-mode pooler on port `6543` for application traffic
- Session-mode pooler on port `5432` for Prisma migrations and administrative operations

The strings normally resemble:

```env
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"
```

Always copy the actual host, region, and project reference from Supabase.

## 3. Configure the server environment

Create or edit `shop-owner-server/.env`. Do not create this file in the React client.

```env
DATABASE_URL="postgresql://postgres.PROJECT_REF:URL_ENCODED_PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require&uselibpqcompat=true"
DIRECT_URL="postgresql://postgres.PROJECT_REF:URL_ENCODED_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require"
```

Replace all placeholders with values from Supabase. Do not retain square brackets around the password.

If the password contains reserved URL characters, URL-encode it. Examples:

| Character | Encoded value |
| --- | --- |
| `@` | `%40` |
| `#` | `%23` |
| `/` | `%2F` |
| `?` | `%3F` |
| `%` | `%25` |

The `uselibpqcompat=true` option was needed in the local Windows environment because the Node PostgreSQL driver reported `self-signed certificate in certificate chain`. It keeps TLS encryption enabled while applying libpq-compatible `sslmode=require` behavior. A production environment with a correctly trusted certificate chain may not require this option.

Never expose either connection string through a `VITE_` variable or client-side code.

## 4. Protect secrets and database dumps

Ensure `shop-owner-server/.gitignore` contains:

```gitignore
.env
.env.*
!.env.example
*.dump
```

Never commit `.env`, database passwords, connection strings, or database dump files.

Optionally create a safe `.env.example`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:6543/postgres?pgbouncer=true&sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/postgres?sslmode=require"
```

## 5. Configure Prisma migration access

`prisma.config.ts` should use the session-mode connection for migrations and fall back to the runtime connection if necessary:

```ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
```

The running server uses `DATABASE_URL` through `src/db/prisma.ts`:

```ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });
```

## 6. Generate the Prisma client

From `shop-owner-server`, run:

```bash
npx prisma validate
npx prisma generate
```

From Git Bash on Windows, use this form if `npx` has an execution problem:

```bash
npx.cmd prisma generate
```

If Windows reports `EPERM` while creating `src/generated/prisma/internal`:

1. Stop the Express development server.
2. Close any Prisma Studio process.
3. Retry the command from PowerShell.
4. Restart VS Code if another process still locks the generated directory.

## 7. Deploy the schema to Supabase

This repository already contains Prisma migration files. Apply them to Supabase with:

```bash
npx prisma migrate deploy
npx prisma migrate status
```

Use `migrate deploy`, not `migrate dev`, when applying committed migrations to the hosted database.

After deployment, Supabase should contain:

- `Product`
- `Customer`
- `Order`
- `_prisma_migrations`

Do not manually recreate these tables in the Supabase Table Editor. Prisma migrations are the source of truth for the application schema.

## 8. Transfer existing local PostgreSQL data (optional)

Skip this section for a new, empty application.

### 8.1 Export local data

Run the following in Windows PowerShell from `shop-owner-server`. Adjust the PostgreSQL installation path and local database settings when necessary:

```powershell
& "E:\Program Files\PostgreSQL\18\bin\pg_dump.exe" `
  --host=localhost `
  --port=5432 `
  --username=postgres `
  --dbname=shop-owner `
  --data-only `
  --format=custom `
  --no-owner `
  --no-privileges `
  --file="shop-owner-data.dump"
```

Enter the password for the **local** PostgreSQL user. This is not the Supabase password.

### 8.2 Restore data to Supabase

Use the session-mode pooler host, username, and port from `DIRECT_URL`:

```powershell
& "E:\Program Files\PostgreSQL\18\bin\pg_restore.exe" `
  --host=aws-0-REGION.pooler.supabase.com `
  --port=5432 `
  --username=postgres.PROJECT_REF `
  --dbname=postgres `
  --data-only `
  --no-owner `
  --no-privileges `
  --exit-on-error `
  "shop-owner-data.dump"
```

Enter the Supabase database password when prompted. PowerShell does not display password characters while typing.

If the remote tables contain disposable test data and the restore reports duplicate keys, clear the rows in the Supabase SQL Editor before restoring again:

```sql
TRUNCATE TABLE "Order", "Customer", "Product" CASCADE;
```

This command permanently deletes the existing rows. Do not run it against data that must be retained.

## 9. Start the local server

Stop any server process that was started before `.env` was changed, then restart it:

```bash
npm run dev
```

The environment file is loaded when the Node process starts. Editing `.env` does not update an already-running process.

Test the API:

```text
http://localhost:8080/api/products
```

A successful response is a JSON array containing the products stored in Supabase.

## 10. Verify that Supabase is being used

Use at least one of these methods.

### Supabase Table Editor

1. Open the Supabase project.
2. Select **Table Editor** in the left sidebar.
3. Select the `public` schema.
4. Open `Product`, `Customer`, or `Order`.

### Supabase SQL Editor

```sql
SELECT * FROM "Product";
SELECT * FROM "Customer";
SELECT * FROM "Order";
```

The quotes are required because Prisma created case-sensitive table names.

To compare row counts:

```sql
SELECT COUNT(*) AS products FROM "Product";
SELECT COUNT(*) AS customers FROM "Customer";
SELECT COUNT(*) AS orders FROM "Order";
```

### Prisma Studio

Because `.env` points to Supabase, this command displays the hosted data:

```bash
npx prisma studio
```

### End-to-end write test

1. Create or edit a product through the React application.
2. Refresh the `Product` table in Supabase.
3. Confirm that the row was created or changed.

This proves that the React client calls Express and that Express writes to Supabase through Prisma.

## 11. Normal schema-change workflow

When changing `prisma/schema.prisma` during development:

1. Edit the Prisma schema.
2. Create a migration against a development database:

   ```bash
   npx prisma migrate dev --name describe_the_change
   ```

3. Commit the new folder under `prisma/migrations`.
4. Apply committed migrations to the hosted database:

   ```bash
   npx prisma migrate deploy
   ```

5. Regenerate the client when necessary:

   ```bash
   npx prisma generate
   ```

Avoid making production schema changes manually in the Supabase Table Editor because they will not be represented in Prisma migration history.

## 12. Production server deployment

Supabase hosts the database, not this Express server. The API remains unavailable whenever the local server is stopped.

When deploying the Express server:

1. Add `DATABASE_URL` and `DIRECT_URL` to the hosting provider's encrypted environment-variable settings.
2. Never upload or commit the local `.env` file.
3. Run `npx prisma migrate deploy` as a release or deployment step.
4. Run `npm run build` and start the compiled server with `npm start`.
5. Configure CORS to allow the deployed client URL instead of only `http://localhost:5173`.
6. Configure the React client's API base URL to point to the deployed Express server.

## Troubleshooting

### API returns `Failed to get products`

Read the Express terminal output. The API intentionally returns a generic response while the actual Prisma error is logged by the server.

Confirm that:

- `DATABASE_URL` is present in `shop-owner-server/.env`.
- The password is correct and URL-encoded.
- The transaction pooler uses port `6543`.
- The username includes the project reference: `postgres.PROJECT_REF`.
- The server was restarted after editing `.env`.

### `self-signed certificate in certificate chain`

Add the tested compatibility option to `DATABASE_URL`:

```text
&sslmode=require&uselibpqcompat=true
```

If the URL has no query string yet, begin the parameters with `?` rather than `&`.

### Prisma cannot reach the database

- Confirm that the Supabase project is running and not paused.
- Copy the strings again from **Connect > ORM > Prisma**.
- Use the session pooler on port `5432` if the direct database endpoint is unavailable over an IPv4-only network.
- Check firewall, VPN, antivirus, or corporate proxy settings.

### Restore reports duplicate keys

The same IDs or unique values already exist in Supabase. Decide whether to retain the remote data, merge it deliberately, or truncate only disposable remote rows before importing again.

### Supabase dashboard says `No migrations`

That dashboard indicator can refer to Supabase-managed migration tooling. Check Prisma's migration state with:

```bash
npx prisma migrate status
```

Also inspect the `_prisma_migrations` table in Supabase.

## Security checklist

- Keep all PostgreSQL credentials on the server.
- Never put a database URL in the React client.
- Never prefix a database secret with `VITE_`.
- Never commit `.env` or `*.dump` files.
- Rotate the database password immediately if it is exposed.
- Store production secrets in the deployment provider's encrypted settings.
- Use separate Supabase projects or databases for development and production when the application becomes important.
