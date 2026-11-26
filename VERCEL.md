# Deploy to Vercel

This project needs a small adaptation on Vercel because the local server normally calls `app.listen()`. Vercel runs serverless functions instead, so the repository now includes:

- `api/index.js` — exports the Express app as a serverless handler.
- `vercel.json` — builds the monorepo from the repository root, serves `checkout-page/dist`, and rewrites `/api/*` to the function.
- `.vercelignore` — keeps local secrets and build junk out of the upload.
- `server/src/server.ts` — exports the same app without listening when imported.

This remains **test checkout only**. Do not point a Vercel deployment at live payments.

## Prerequisites

1. Push the latest code to <https://github.com/Ruto1M/dummy-account>.
2. Create an external PostgreSQL database. Vercel does not provide one automatically.
   - Suitable options: Neon, Supabase, Render PostgreSQL, or another managed PostgreSQL service.
   - The database must accept external TLS connections.
   - Copy the full connection string, including SSL requirements.
3. Generate three independent random secrets of at least 32 characters:

   ```bash
   openssl rand -hex 32
   openssl rand -hex 32
   openssl rand -hex 32
   ```

## Step 1: Import the repository into Vercel

1. Log in to <https://vercel.com>.
2. Click **Add New → Project**.
3. Import `Ruto1M/dummy-account`.
4. Set **Root Directory** to the repository root, not `checkout-page/`.
5. Vercel should read `vercel.json`:
   - Build command: `npm run build`
   - Output directory: `checkout-page/dist`
6. Click **Deploy** only after adding the environment variables below.

## Step 2: Add environment variables

In the Vercel project, open **Settings → Environment Variables** and add these for Production (and Preview if you want previews to work):

```text
NODE_ENV=production
DATABASE_URL=<your managed PostgreSQL connection string>
SESSION_SECRET=<random 32+ char value>
CSRF_SECRET=<random 32+ char value>
PAYMENT_WEBHOOK_SECRET=<random 32+ char value>
PAYMENT_PROVIDER=test
CHECKOUT_TEST_MODE=true
PUBLIC_WEB_ORIGIN=https://<your-project>.vercel.app
PUBLIC_API_ORIGIN=https://<your-project>.vercel.app
COOKIE_SECURE=true
DB_POOL_MAX=2
```

Important:

- `PUBLIC_WEB_ORIGIN` and `PUBLIC_API_ORIGIN` must be the **same HTTPS origin** as the deployed app.
- Do not use `http://localhost:...` in a deployed environment.
- `COOKIE_SECURE=true` is required when `NODE_ENV=production`.
- `PAYMENT_PROVIDER` must stay `test`; no live or sandbox adapter is registered.
- Do not paste values from local `.env` if they contain local-only URLs.

## Step 3: Prepare the database

From your local machine, run migrations and seed against the **deployed** database:

```bash
DATABASE_URL='<your managed PostgreSQL connection string>' npm run db:migrate
DATABASE_URL='<your managed PostgreSQL connection string>' npm run db:seed
```

An environment variable passed on the command line takes precedence over local `.env`.

Never run these commands against a shared or production database used by real customers. This seed data is for the test checkout only.

## Step 4: Deploy

After the environment variables and database are ready:

```bash
git add -A
git commit -m "Add Vercel deployment support"
git push -u origin main
```

Vercel will build automatically. You can also click **Redeploy** in the dashboard.

## Step 5: Verify the deployment

Open:

```text
https://<your-project>.vercel.app/
https://<your-project>.vercel.app/api/health
```

`/api/health` should return JSON containing:

```json
{
  "ok": true,
  "database": "connected",
  "providerMode": "test",
  "liveCheckoutEnabled": false
}
```

Then complete a test checkout:

1. Continue as guest or register.
2. Fill shipping details.
3. Accept necessary consent on review.
4. Choose card or PayPal.
5. On the hosted test page, use **Pay (test)**, **Decline**, or **Cancel**.

No real card data should be entered anywhere.

## Troubleshooting

### `Missing required configuration: ...`

An environment variable is missing in Vercel. Add it in **Settings → Environment Variables** and redeploy.

### `COOKIE_SECURE=true is required in production`

Set `COOKIE_SECURE=true`. Also make sure both public origins use `https://`.

### `PAYMENT_PROVIDER=sandbox is not supported`

Only `test` is implemented. Set `PAYMENT_PROVIDER=test` and `CHECKOUT_TEST_MODE=true`.

### `/api/health` returns `database unavailable`

Check:

- `DATABASE_URL` is correct and includes required SSL parameters.
- The database allows connections from Vercel.
- Migrations were run against that database.
- The database is not paused.

### API routes return 404 but the page loads

Confirm `vercel.json` is committed with the `/api/(.*)` rewrite and that the Vercel project root is the repository root.

### Build fails on workspace imports

Make sure Vercel builds from the repository root with `npm run build`. Do not set Root Directory to `checkout-page/`.

### Preview deployments have login/session problems

Preview URLs have different origins. Set `PUBLIC_WEB_ORIGIN` and `PUBLIC_API_ORIGIN` to each preview URL, or disable Preview environment variables and test only on Production.

## Limits of this deployment

- GitHub hosts source; Vercel runs the app; PostgreSQL must be hosted separately.
- The app remains in local/test provider mode.
- Live checkout still requires a real provider adapter, reviewed policies, and every gate in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).
- This setup does not constitute a legal, tax, PCI, or security certification.
