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
