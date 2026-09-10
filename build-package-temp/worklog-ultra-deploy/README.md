# WorkLog Ultra Deploy Package

This package includes:
- `backend/` current application source
- `database/` Prisma schema, migrations, seed, and current SQL dump
- `deployment-extras/` CyberPanel, Docker, and Nginx helper files

Recommended deploy flow:
1. Upload and extract this zip on your server.
2. Go into `backend/`.
3. Copy `.env.production.example` to `.env` and set production values.
4. Run `npm install`.
5. Run `npx prisma generate --schema=../database/schema.prisma`.
6. Run `npx prisma db push --schema=../database/schema.prisma`.
7. If you want current data, restore `database/worklog-db.sql`.
8. Run `npm run build`.
9. Start with `node server.js` or PM2.
