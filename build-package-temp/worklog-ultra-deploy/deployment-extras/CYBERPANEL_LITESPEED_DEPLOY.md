# CyberPanel + LiteSpeed Deployment Guide

This guide is for deploying WorkLog Ultra on a CyberPanel server with LiteSpeed.

## Best setup

Use:

- 1 website/app domain: `worklog.mugnee.com`
- 1 Node.js app process
- 1 PostgreSQL database
- persistent storage for `public/uploads`

Do not split this app into separate frontend and backend projects.
This is already a fullstack Next.js app.

## What to upload

Upload the contents of:

- `final-upload/backend`

Also keep:

- `final-upload/database`

for database setup reference.

## On your server

Recommended app path:

```text
/home/worklog.mugnee.com/app
```

Upload backend files there.

## Environment file

Create:

```text
/home/worklog.mugnee.com/app/.env
```

Put your real production env values in it.

Minimum required:

```env
DATABASE_URL=
AUTH_SECRET=
AUTH_SIGNUP_OTP_SECRET=
AUTH_SIGNUP_HR_CODE=
AUTH_SIGNUP_MANAGER_CODE=
AUTH_SIGNUP_ADMIN_CODE=
AUTH_SIGNUP_SHOW_OTP_ON_SCREEN=false
APP_BASE_URL=https://worklog.mugnee.com
AUTH_EMAIL_REDIRECT_TO=https://worklog.mugnee.com
RESEND_API_KEY=
RESEND_FROM_EMAIL=no-reply@worklog.mugnee.com
```

## Node app in CyberPanel

In CyberPanel:

1. Open `Websites`
2. Open your site
3. Open `Manage`
4. Open `Node.js App`
5. Create app

Suggested settings:

- App root: `/home/worklog.mugnee.com/app`
- App URL: `worklog.mugnee.com`
- App startup file: `server.js`
- Port: any free internal port, for example `3000` or `3010`
- Node version: latest stable available

## Start command

If CyberPanel asks only for startup file, use:

- `server.js`

If it asks for command, use:

```bash
node server.js
```

## PostgreSQL

Create your PostgreSQL database first.

Then set `DATABASE_URL` in `.env`.

If your server already has Node/npm available, from app folder run:

```bash
npx prisma db push
```

Optional seed:

```bash
npm run db:seed
```

## Uploads must persist

Make sure these folders survive redeploy:

- `public/uploads/avatars`
- `public/uploads/messages`

If needed, back them up before replacing files.

## LiteSpeed rewrite / reverse proxy

Usually CyberPanel handles Node app proxying for you.

If manual proxying is needed, use the provided `nginx.worklog.conf` only as a reference.

## After upload

1. restart Node app
2. open `https://worklog.mugnee.com`
3. test login
4. test signup OTP mail
5. test forgot password mail
6. test avatar upload
7. test message attachment upload

## If mail does not arrive

Check:

- Resend domain verification
- sender verification
- server `.env`
- app restart after env change

## Recommended deploy workflow

Whenever you update:

1. build locally
2. recreate `final-upload`
3. upload `backend`
4. do not overwrite uploads unless needed
5. restart Node app
