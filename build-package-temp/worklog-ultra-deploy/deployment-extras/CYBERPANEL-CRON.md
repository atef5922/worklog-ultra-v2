## CyberPanel Reminder Cron Setup

Use these cron jobs on your LiteSpeed/CyberPanel server to trigger WorkLog reminder emails in Bangladesh time.

### Before you add cron

1. Make sure your app is live on:
   - `https://worklog.mugnee.com`
2. Make sure `.env` on the server contains:
   - `AUTH_SECRET=...`
3. Use the same `AUTH_SECRET` value in the header below as the cron key.

### 10:30 AM morning plan reminder

Send only if the user has not submitted today's work plan.

```bash
curl -X POST "https://worklog.mugnee.com/api/automation/reminders" ^
  -H "Content-Type: application/json" ^
  -H "x-worklog-cron-key: YOUR_AUTH_SECRET" ^
  -d "{\"kind\":\"plan_morning\"}"
```

### 7:30 PM evening report reminder

Send only if the user has not submitted today's report.

```bash
curl -X POST "https://worklog.mugnee.com/api/automation/reminders" ^
  -H "Content-Type: application/json" ^
  -H "x-worklog-cron-key: YOUR_AUTH_SECRET" ^
  -d "{\"kind\":\"report_evening\"}"
```

### Optional attendance reminder

If you also want a morning attendance reminder:

```bash
curl -X POST "https://worklog.mugnee.com/api/automation/reminders" ^
  -H "Content-Type: application/json" ^
  -H "x-worklog-cron-key: YOUR_AUTH_SECRET" ^
  -d "{\"kind\":\"attendance_morning\"}"
```

### CyberPanel timing

Set your cron schedule in CyberPanel with Bangladesh time:

- Morning plan reminder: `30 10 * * *`
- Evening report reminder: `30 19 * * *`
- Optional attendance reminder example: `15 10 * * *`

### What the API does

- `plan_morning`: emails only users who still have no plan today
- `report_evening`: emails only users who have a plan today but no report yet
- `attendance_morning`: emails only users who still have not checked in

### Safety

- Team Head/Admin can still run reminders manually if needed.
- If a reminder for the same user/day/kind has already been sent, the system will not spam them again.
