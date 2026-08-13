# TimeGPS Pro — Supabase + Vercel edition

Originally a Google Apps Script attendance app, now running on:

- **Database & file storage:** Supabase (Postgres + Storage)
- **Backend:** Next.js API routes (`app/api/*`) — deployed as Vercel
  Serverless Functions
- **Frontend:** the same single-page UI (`public/index.html`)
- **Admin auth:** a real login (email + password) backed by an
  `admin_users` table and signed HttpOnly session cookies — not a shared
  password typed into the page
- **Worker self-service:** a "ประวัติของฉัน" (my history) tab where any
  employee can look up their *own* attendance record with their emp ID +
  PIN — the API re-verifies the PIN on every request and only ever returns
  rows for that emp ID, so one worker can never see another's history

## New: reports by branch, by day, or by month

The reports panel in **จัดการระบบ** now lets you print/download a payroll-ready
attendance report three ways, all showing the exact clock-in/clock-out
**date and time** per employee per day:

- **รายเดือน (monthly)** — every day worked in the chosen month, with a
  subtotal per employee (days worked, total hours, incomplete-day count).
- **รายวัน (daily)** — every employee's in/out time for one specific date.
- **Branch filter** — a new "สาขา" field on each employee (separate from
  "แผนก") lets you filter/print either report for a single branch, or
  leave it blank to include every branch.

If you already deployed this app before this feature existed, run
`migration-add-branch.sql` once in the Supabase SQL Editor to add the new
`branch` column to `employees` and `attendance` — then open each employee
in **รายชื่อพนักงานในสังกัด → แก้ไข** and fill in their สาขา.

## Already done for you

The Supabase project (`TimeGPSv1.0`, ref `dslhehnsvaeogrffwbpn`) already
has:
- ✅ `employees`, `locations`, `attendance`, `admin_users` tables (RLS on)
- ✅ `selfies` public storage bucket
- ✅ Seed data: demo employee `1001` and location `LOC_BANGKOK`
- ✅ One admin account: `novasolltd2025@gmail.com`

## 1. Set environment variables

Copy `.env.local.example` to `.env.local` for local dev (or set these
directly in Vercel → Project Settings → Environment Variables):

```
SUPABASE_URL=https://dslhehnsvaeogrffwbpn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...   # Project Settings → API → service_role secret
ADMIN_SESSION_SECRET=...        # any long random string, e.g. `openssl rand -base64 32`
```

`SUPABASE_SERVICE_ROLE_KEY` is only ever read inside server-side API routes
(`lib/supabaseAdmin.js`) — it's never sent to the browser.

`ADMIN_SESSION_SECRET` signs the admin login session cookie. It is
*different* from any Supabase key — treat it as its own secret.

## 2. Run locally (optional)

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`.

## 3. Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Vercel dashboard → **New Project** → import the repo (auto-detects
   Next.js, no build config needed).
3. Add the three environment variables from step 1 under **Environment
   Variables** (Production + Preview).
4. Deploy.

## Managing admin accounts

There's no self-service admin signup screen on purpose — a stranger should
never be able to create their own admin account. To add another admin,
run this in the Supabase SQL Editor (generate the hash locally first, e.g.
`node -e "console.log(require('bcryptjs').hashSync('their-password', 10))"`):

```sql
insert into admin_users (email, password_hash)
values ('someone@example.com', '<bcrypt hash>');
```

To remove one: `delete from admin_users where email = '...';`

## How the QR-code check-in flow works (unchanged)

From **จัดการระบบ → สร้างป้ายสแกน QR Code**, pick a saved location and print
the label. The QR code encodes your site's own URL with
`?lat=...&lng=...&loc=...&r=...` — scanning it opens the attendance page
pre-loaded with that location's coordinates and allowed radius.

## Architecture summary

| Concern | Implementation |
|---|---|
| Employee/location/attendance data | Supabase Postgres |
| Selfie photos | Supabase Storage bucket `selfies` |
| Admin login | `admin_users` table (bcrypt hash) + signed HttpOnly cookie session (`lib/adminSession.js`) |
| Admin-only routes | `employees`, `locations`, `report` APIs check the session cookie via `isAdminAuthorized()` |
| Worker's own history | `/api/my-attendance` — re-verifies PIN, scopes query to that emp ID only |
| Hosting | Vercel (serverless functions + static HTML) |

## A note on the selfie upload size

Vercel's default serverless function request-body limit (4.5 MB on most
plans) comfortably fits the JPEG selfies this app captures (a 640×480 canvas
at quality 0.85 is typically well under 200 KB).
