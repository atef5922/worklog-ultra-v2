# WorkLog CyberPanel Deploy

Upload this ZIP directly into:

`/home/worklog.mugnee.com/public_html`

Then run:

```bash
npm install --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 start npm --name worklog -- start
```

Important:

- Do not overwrite production `.env`
- Do not delete `public/uploads`
- This package is source-based and runs with `npm start`
- `package.json` is at the ZIP root
- No `server.js` is required for this VPS flow

Attendance cutoff automation:

- Configure a CyberPanel cron to `POST /api/automation/attendance-cutoff` every five minutes.
- Send `x-worklog-cron-key` with the production `AUTH_SECRET` value.
- The route is idempotent and stores the exact 7:30 PM Asia/Dhaka cutoff even if a cron run is delayed.
- Dashboard synchronization also applies the cutoff as a fallback when the app is open or next visited.
