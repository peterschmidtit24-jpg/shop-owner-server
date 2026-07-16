# Deploying the Shop Owner Server to Vercel

This guide describes the working deployment setup for the Express, Prisma, and Supabase server in this repository.

## Architecture

```text
Vercel client
    |
    | HTTPS requests
    v
Vercel Express server
    |
    | Prisma using DATABASE_URL
    v
Supabase PostgreSQL
```

The client communicates with the Express API. Database credentials must exist only in the server project.

## Prerequisites

- A Vercel account connected to GitHub
- The server repository pushed to GitHub
- A running Supabase project
- Supabase connection strings for Prisma
- Committed Prisma migrations under `prisma/migrations`

## 1. Prepare the environment variables

The local `shop-owner-server/.env` should contain:

```env
DATABASE_URL="postgresql://USER:PASSWORD@POOLER_HOST:6543/postgres?pgbouncer=true&sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@SESSION_HOST:5432/postgres?sslmode=require"
ORIGIN="http://localhost:5173"
```

Use the real connection strings supplied by Supabase. The values above are placeholders.

- `DATABASE_URL` is the pooled runtime connection used by the Express server.
- `DIRECT_URL` is the session or direct connection used for Prisma migrations.
- `ORIGIN` is the client origin allowed by CORS.

Never commit `.env`, expose either database URL through a `VITE_` variable, or place database credentials in the client project.

## 2. Load `ORIGIN` in the Express server

The entry point must load `.env` and configure CORS from `ORIGIN`:

```ts
import "dotenv/config";
import cors from "cors";

app.use(cors({
  origin: process.env.ORIGIN ?? "http://localhost:5173",
}));
```

The fallback keeps local development working when `ORIGIN` is not defined.

For a conventional Node deployment, the port can also use the platform-provided value:

```ts
const port = Number(process.env.PORT ?? 8080);
```

Do not create a `PORT` environment variable in Vercel. Vercel supplies it when required.

## 3. Generate Prisma Client before TypeScript compilation

The generated client is excluded from Git by this repository:

```gitignore
/src/generated/prisma
```

Therefore, a clean Vercel build must generate it. The build script in `package.json` must be:

```json
{
  "scripts": {
    "build": "prisma generate && tsc"
  }
}
```

If the command were only `tsc`, Vercel would report errors such as:

```text
Cannot find module '../generated/prisma/client.js'
Cannot find module '../generated/prisma/enums.js'
Parameter 'tx' implicitly has an 'any' type
```

The transaction callback errors are secondary errors caused by the missing generated Prisma types.

## 4. Use a Vercel-compatible TypeScript version

This project pins TypeScript to version `5.9.3`:

```json
{
  "devDependencies": {
    "typescript": "5.9.3"
  }
}
```

Keep the version exact rather than using `^5.9.3`. Both `package.json` and `package-lock.json` must be committed.

TypeScript 7.0.2 caused Vercel CLI 56.2.0 to fail after compilation with:

```text
Cannot read properties of undefined (reading 'readFile')
```

Prisma 7.8 supports TypeScript 5.9.3 because its TypeScript requirement is version 5.4 or newer.

## 5. Validate locally

From `shop-owner-server`, run:

```powershell
npm install
npx prisma generate
npm run typecheck
npm run build
npm run dev
```

Test the local endpoints:

```text
http://localhost:8080/
http://localhost:8080/api/products
http://localhost:8080/api/orders
```

If Windows reports `EPERM` while generating `src/generated/prisma/internal`, stop the development server and Prisma Studio, then retry. Restart VS Code if a process still holds the generated files open.

## 6. Apply database migrations

Apply committed migrations deliberately before the production deployment:

```powershell
npx prisma migrate deploy
npx prisma migrate status
```

The Prisma configuration uses `DIRECT_URL` for this operation and falls back to `DATABASE_URL` when necessary:

```ts
datasource: {
  url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
}
```

Do not add `prisma migrate deploy` to the normal Vercel build command. Otherwise, preview deployments could attempt to change the production database.

## 7. Commit and push the deployment configuration

At minimum, commit the relevant source, package, and lockfile changes:

```powershell
git add src/server.ts package.json package-lock.json
git commit -m "Prepare server for Vercel deployment"
git push origin main
```

Do not commit `.env` or generated Prisma Client files.

## 8. Import the GitHub repository into Vercel

1. Open the Vercel dashboard.
2. Select **Add New > Project**.
3. Locate the `shop-owner-server` GitHub repository.
4. Select **Import**.
5. If this server is its own repository, leave the root directory as `.`.
6. If the server is inside a repository containing multiple projects, set the root directory to `shop-owner-server`.
7. Use the **Other** framework preset if Vercel requests one.
8. Keep the default install command.
9. Keep `npm run build` as the build command.
10. Do not configure an output directory.

Vercel detects `src/server.ts` as a Node server. An `/api` wrapper and `vercel.json` are not required for this setup.

## 9. Configure the server variables in Vercel

In the import screen, or later under **Project > Settings > Environment Variables**, create these variables separately:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | Complete Supabase pooled runtime URL |
| `DIRECT_URL` | Complete Supabase session/direct URL |
| `ORIGIN` | Deployed client origin |

When entering variables manually:

- Put only the name, such as `DATABASE_URL`, in the key field.
- Put only the complete connection string in the value field.
- Do not include `DATABASE_URL=` in the value.
- Prefer values without surrounding quote characters.
- Select Production and Preview when both deployment types should work.

If the client is not deployed yet, temporarily use this value for `ORIGIN`:

```text
http://localhost:5173
```

This allows the server to deploy, but a browser running the production client will not be accepted until `ORIGIN` is updated.

## 10. Deploy and test the server

Select **Deploy**. After a successful deployment, Vercel provides a URL similar to:

```text
https://shop-owner-server.vercel.app
```

Test:

```text
https://shop-owner-server.vercel.app/
https://shop-owner-server.vercel.app/api/products
https://shop-owner-server.vercel.app/api/orders
```

The root route should return `Shop Owner API`. The API routes should return JSON backed by Supabase.

## 11. Connect the deployed client

In the Vercel project for `shop-owner-client`, add:

```env
VITE_API_URL=https://shop-owner-server.vercel.app/api
```

Use the actual server URL. The `/api` suffix is required by the current Axios client configuration.

Deploy the client, then copy its production origin, for example:

```text
https://shop-owner-client.vercel.app
```

In the server's Vercel project, update:

```env
ORIGIN=https://shop-owner-client.vercel.app
```

Use only the origin, with no route and preferably no trailing slash. Redeploy the server after changing the variable because environment-variable changes apply only to new deployments.

## 12. Verify the complete deployment

1. Open the deployed client.
2. Confirm that products and orders load.
3. Create or edit a product.
4. Refresh the corresponding Supabase table.
5. Confirm that the change was persisted.
6. Check the browser console and Vercel runtime logs for CORS or database errors.

## Troubleshooting

### Prisma modules cannot be found

Confirm that the build script runs Prisma generation first:

```json
"build": "prisma generate && tsc"
```

Commit and push both `package.json` and `package-lock.json`, then redeploy without relying on an old Git commit.

### Vercel reports `reading 'readFile'`

Confirm that TypeScript is pinned exactly:

```json
"typescript": "5.9.3"
```

Run `npm install`, commit the updated lockfile, and redeploy.

### Browser reports a CORS error

Confirm that the server's `ORIGIN` exactly matches the client's origin:

```text
https://shop-owner-client.vercel.app
```

After changing `ORIGIN`, create a new server deployment.

### API returns a database error

Check that:

- `DATABASE_URL` exists in the Vercel server project.
- The pooled URL uses the correct Supabase host, user, password, and port.
- Reserved password characters are URL-encoded.
- Supabase is running and accessible.
- Prisma migrations have been deployed.

### A pushed commit does not fix the deployment

Open the Vercel deployment details and confirm that the displayed Git commit is the new commit. Redeploying an older deployment may rebuild the old source rather than the latest `main` branch.

## Security checklist

- Keep `.env` ignored by Git.
- Keep database URLs out of the client project.
- Never prefix database credentials with `VITE_`.
- Do not commit database dump files.
- Use Vercel's encrypted environment-variable settings.
- Rotate the Supabase password immediately if it is exposed.
- Use separate databases or Supabase projects for development and production when the application contains important data.

## References

- [Vercel Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel monorepo configuration](https://vercel.com/docs/monorepos)
- [Prisma PostgreSQL connector](https://www.prisma.io/docs/orm/core-concepts/supported-databases/postgresql)
