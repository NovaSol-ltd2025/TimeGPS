# TimeGPS Pro — Supabase + Vercel edition

This is the original Google Apps Script attendance app, ported to:

- **Database & file storage:** Supabase (Postgres + Storage, replacing the
  Google Sheet and Google Drive folder)
- **Backend:** Next.js API routes (`app/api/*`, replacing `doPost` / `doGet`
  in `Code.gs`) — runs as Vercel Serverless Functions
- **Frontend:** the same single-page UI (`public/index.html`), with its
  `fetch()` calls pointed at the new `/api/*` routes instead of a Google
  Apps Script web app URL

Nothing about the look, the Thai copy, the camera/GPS/QR/print flows, or the
admin panel changed — only where the data lives and how the browser talks to
the backend.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → New project.
2. Open **SQL Editor** → New query → paste the contents of
   `supabase-schema.sql` from this repo → Run.
   This creates the `employees`, `locations`, and `attendance` tables (with
   the same demo seed row the original script created automatically), and
   enables Row Level Security so the public/anon key can't read or write
   them directly.
3. Open **Storage** → New bucket → name it exactly `selfies` → toggle
   **Public bucket** ON → Create. This replaces the `Attendance_Selfies_Pro`
   Google Drive folder; the API uploads selfies here and stores the public
   URL in the `attendance.photo_url` column.
4. Open **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret key → `SUPABASE_SERVICE_ROLE_KEY`

   The service role key is only ever used inside the server-side API
   routes (`lib/supabaseAdmin.js`) — it is never sent to the browser. All
   reads/writes go through your own `/api/*` endpoints, which is why RLS is
   enabled with no public policies: the anon key genuinely cannot touch
   these tables, and your API is the only door in.

## 2. Configure environment variables

Copy `.env.local.example` to `.env.local` for local dev, and fill in:

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_PASSWORD=...
```

`ADMIN_PASSWORD` replaces the `ADMIN_PASSWORD` constant that used to be
hard-coded at the top of `Code.gs`. Pick a strong one — anyone who knows it
can add/edit/delete employees and locations and pull attendance reports.

## 3. Run locally (optional)

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`.

## 4. Deploy to Vercel

1. Push this folder to a GitHub repo (or run `vercel` from inside it with
   the [Vercel CLI](https://vercel.com/docs/cli)).
2. In the Vercel dashboard: **New Project** → import the repo → it will
   auto-detect Next.js, no build settings to change.
3. Under **Environment Variables**, add the same three variables as in
   `.env.local.example` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `ADMIN_PASSWORD`) for the Production (and Preview) environments.
4. Deploy. Your app is now live at `https://your-project.vercel.app`.

## How the QR-code check-in flow works (unchanged)

Same as the original: from **จัดการระบบ → สร้างป้ายสแกน QR Code**, pick a
saved location and print the label. The QR code encodes your site's own URL
with `?lat=...&lng=...&loc=...&r=...` query params — scanning it opens the
attendance page pre-loaded with that location's coordinates and allowed
radius, exactly as before.

## What changed under the hood

| Original (Google Apps Script) | This version |
|---|---|
| Google Sheet (`Employees`, `Locations`, `Attendance` tabs) | Supabase Postgres tables (`employees`, `locations`, `attendance`) |
| Google Drive folder for selfies | Supabase Storage bucket `selfies` |
| `doPost(e)` single endpoint with an `action` field | REST-style routes under `app/api/*` |
| `ADMIN_PASSWORD` constant in `Code.gs` | `ADMIN_PASSWORD` environment variable, checked per-request via an `x-admin-password` header |
| Deployed as a GAS Web App | Deployed as a Vercel project (serverless functions + static HTML) |

## A note on the selfie upload size

Vercel's default serverless function request-body limit (4.5 MB on most
plans) comfortably fits the JPEG selfies this app captures (a 640×480 canvas
at quality 0.85 is typically well under 200 KB), so no extra configuration
is needed for normal use.
