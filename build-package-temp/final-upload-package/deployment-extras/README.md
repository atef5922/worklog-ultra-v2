# WorkLog Ultra Deployment Package

This app is already a fullstack Next.js application.

You do not need to split frontend and backend into separate projects for normal deployment.

What to deploy:
- Next.js app
- PostgreSQL database
- `public/uploads` folder for avatars and message attachments

## Recommended Production Setup

Use:
- 1 app service for Next.js
- 1 PostgreSQL database
- optional Nginx reverse proxy in front of the app

## Quick Structure

- `Dockerfile`: production image for the Next.js app
- `docker-compose.yml`: app + PostgreSQL example
- `.env.production.example`: production env template
- `nginx.worklog.conf`: reverse proxy example

## Before Upload

1. Copy your real production env values into `.env.production`
2. Make sure `worklog.mugnee.com` is verified in Resend
3. Make sure `no-reply@worklog.mugnee.com` is verified in Resend
4. Keep `public/uploads` persistent after deploy
5. Run database migration or schema sync on the target server

## Production Commands

Install and build:

```bash
npm install
npm run build
```

Start:

```bash
npm start
```

## Database

Recommended:
- create a PostgreSQL database
- set `DATABASE_URL`
- run:

```bash
npx prisma db push
```

If you want seeded departments:

```bash
npm run db:seed
```

## Persistent Uploads

These directories must survive redeploys:
- `public/uploads/avatars`
- `public/uploads/messages`

If your hosting wipes files on deploy, mount these as persistent storage.

## What Admin Uploads

If you manually upload to a server, upload:
- entire app codebase
- `.next` after build, or build directly on server
- `public/uploads` if you already have live user files
- production `.env`

## Best Deployment Advice

For your current app, best practice is:
- keep frontend + backend together in this same Next.js app
- keep PostgreSQL separate
- keep uploads persistent

That will be simpler, safer, and easier to manage than splitting frontend/backend right now.
