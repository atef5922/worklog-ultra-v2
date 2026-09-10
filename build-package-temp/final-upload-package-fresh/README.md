## WorkLog Ultra Final Upload Package

This folder contains the final production-ready deployment assets.

### Folder overview

- `backend`
  Main runnable Next.js fullstack server package.
  Upload this to your Node.js server.

- `frontend-static`
  Optional static assets folder for Nginx/CDN style serving.
  Use this only if you want to serve `/_next/static` and `public` separately.

- `database`
  PostgreSQL schema, migrations, and seed-related files.
  Use this on the database side.

- `deployment-extras`
  Docker and Nginx helper files.

### Best practice

For this app, the safest deployment is:

1. Upload `backend` to the app server
2. Create PostgreSQL database separately
3. Use files from `database`
4. Keep `public/uploads` persistent

### Backend start

Linux:

```bash
node server.js
```

Windows:

```bat
node server.js
```

### Required env on server

Use your production `.env` values.

Important:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_SIGNUP_OTP_SECRET`
- `AUTH_SIGNUP_HR_CODE`
- `AUTH_SIGNUP_MANAGER_CODE`
- `AUTH_SIGNUP_ADMIN_CODE`
- `APP_BASE_URL`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

### Database setup

Run on the same production database:

```bash
npx prisma db push
```

If needed:

```bash
npm run db:seed
```

### Uploads

These folders must stay persistent after deploy:

- `public/uploads/avatars`
- `public/uploads/messages`

### Update without losing data

For future uploads:

1. keep the existing PostgreSQL database
2. upload only the new backend files
3. run `npx prisma db push`
4. do not restore the SQL dump again unless this is a brand new server
5. do not replace `public/uploads` if it already contains live files

This keeps previous data and uploads intact.

### Frontend-static note

This app is a fullstack Next.js app.
So `frontend-static` is optional only.
The `backend` folder is the real required deployment package.
