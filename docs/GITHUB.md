# Publish this project to GitHub

Target repository: <https://github.com/Ruto1M/dummy-account>

This guide puts the **source code** on GitHub. GitHub hosts the repository; it does not run the Node/PostgreSQL app for you. See [Deployment notes](#deployment-notes) at the end for what is required to run it.

## Before you start

- Create the GitHub repository first if it does not exist. An **empty** repository is easiest.
- Install Git and sign in to GitHub.
- For HTTPS pushes, use a GitHub Personal Access Token or credential manager. GitHub no longer accepts an account password for pushing.
- Never commit `.env`, secrets, production credentials, or real payment data.

This workspace already has the remote configured:

```bash
git remote -v
# origin  https://github.com/Ruto1M/dummy-account.git (fetch)
# origin  https://github.com/Ruto1M/dummy-account.git (push)
```

## Step 1: Check the working tree

```bash
git status
```

Review what will be committed. At this point the converted checkout implementation is uncommitted, so you should see modified and untracked files.

## Step 2: Verify the project before publishing

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run docs:check
```

All five commands should pass. The tests reset the local test database, so make sure `DATABASE_URL` points at your local test PostgreSQL container, never a shared database.

## Step 3: Confirm secrets are ignored

```bash
git check-ignore -v .env
git status --short | grep -E '(^|/)\.env($|\.)' || true
```

Expected:

- `.env` is ignored.
- `.env.example` is tracked because it contains only safe test values.
- No real secret appears in `git status`.

If you accidentally staged a secret, unstage it before committing:

```bash
git restore --staged .env
```

## Step 4: Commit the project

```bash
git add .
git commit -m "Convert checkout demo to server-authoritative TypeScript/PostgreSQL app"
```

If `git commit` says there is nothing to commit, the work is already committed. Check with `git log -1 --oneline`.

## Step 5: Set the branch name

```bash
git branch -M main
```

If your GitHub repository uses `master` instead, replace `main` with `master` in the next command.

## Step 6: Point Git at the GitHub repository

This workspace already has the correct remote, but the following command is safe to run again:

```bash
git remote set-url origin https://github.com/Ruto1M/dummy-account.git
```

For SSH instead, use:

```bash
git remote set-url origin git@github.com:Ruto1M/dummy-account.git
```

## Step 7: Push

For an empty GitHub repository:

```bash
git push -u origin main
```

If GitHub reports that the remote already contains files, pull and rebase first:

```bash
git pull --rebase origin main
git push -u origin main
```

Resolve any conflicts, then run `git add .` and `git rebase --continue` before pushing again.

## Step 8: Verify on GitHub

Open <https://github.com/Ruto1M/dummy-account> and confirm:

- `README.md` renders with the four screenshots.
- `docs/`, `server/`, `shared/`, and `checkout-page/` are present.
- `.env.example` is present.
- `.env` is **not** present.

## Common problems

### `fatal: remote origin already exists`

Use `set-url`, not `add`:

```bash
git remote set-url origin https://github.com/Ruto1M/dummy-account.git
```

### `src refspec main does not match any`

You have not made a commit yet. Go back to Step 4.

### `Updates were rejected because the remote contains work`

The GitHub repository is not empty. Go back to Step 7 and rebase first.

### `Permission denied` or `Authentication failed`

For HTTPS, use a Personal Access Token with `repo` scope, or configure a credential manager. For SSH, add your SSH key to GitHub and use the SSH remote URL.

### Starting from a fresh clone instead

If you want to publish from a clean machine:

```bash
git clone https://github.com/Ruto1M/dummy-account.git
cd dummy-account
# copy the project files into this directory
npm install
npm run typecheck
npm run lint
npm run test
npm run build
git add .
git commit -m "Convert checkout demo to server-authoritative TypeScript/PostgreSQL app"
git push -u origin main
```

## Deployment notes

Pushing to GitHub publishes source code only. To run the app, deploy it to a host that supports Node.js and connect it to PostgreSQL.

Required runtime environment:

```text
NODE_ENV=production
PORT=3001
DATABASE_URL=<managed PostgreSQL connection string>
SESSION_SECRET=<random >=32 char value>
CSRF_SECRET=<random >=32 char value>
PAYMENT_WEBHOOK_SECRET=<random >=32 char value>
PAYMENT_PROVIDER=test
CHECKOUT_TEST_MODE=true
PUBLIC_WEB_ORIGIN=https://<your-domain>
PUBLIC_API_ORIGIN=https://<your-domain>
COOKIE_SECURE=true
```

Start command:

```bash
npm ci
npm run build
npm run db:migrate
npm run db:seed
node server/dist/server.js
```

The built API serves the compiled React app, so one web service plus PostgreSQL is enough for a test deployment. For a Vercel-specific walkthrough, see [VERCEL.md](VERCEL.md). Live checkout still requires a real provider adapter, reviewed legal/tax/privacy settings, and every launch gate in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) to be satisfied.
