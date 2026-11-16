# Madrasa Ghausia Razvia — Complete Madrasa Management Portal

Full-stack institutional management portal built with **React + TypeScript + Tailwind CSS**, **Express (`server.ts`)**, **Supabase PostgreSQL + Auth**, and **ImgBB API** for server-side image hosting.

## Architecture & Security

- **Database & Auth**: Supabase PostgreSQL (`@supabase/supabase-js`) across all modules (students, teachers, parents, classes, subjects, admissions, attendance, examinations, marks/results, homework, online classes, notices, programs, social feed, chats, committee, users/roles, activity logs).
- **Image Hosting**: ImgBB (`server/imgbb.ts`) called strictly server-side via `POST /api/upload` and `POST /api/public/upload`. Returned ImgBB URLs are saved directly in Supabase PostgreSQL columns.
- **Credential Isolation**: `SUPABASE_SERVICE_ROLE_KEY` and `IMGBB_API_KEY` are read exclusively on the backend (`server/`) and never bundled or exposed to the frontend (`src/`).

## Environment Variables

Copy `.env.example` to `.env` (or configure secrets in your hosting provider):

- `VITE_SUPABASE_URL` — Supabase Project URL (client)
- `VITE_SUPABASE_ANON_KEY` — Supabase Anon/Public Key (client)
- `SUPABASE_URL` — Supabase Project URL (server)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase Service Role Key (server only)
- `IMGBB_API_KEY` — ImgBB API Key (server only)
- `PORT` — Server port (default `3000`)

## Supabase Database Setup

Run the scripts in `supabase/` inside your **Supabase Dashboard → SQL Editor** in order (if provisioning a fresh database):

1. `supabase/schema.sql`
2. `supabase/rls-policies.sql`
3. `supabase/storage-policies.sql`
4. `supabase/seed.sql`

> Note: Existing tables/data are preserved safely using `IF NOT EXISTS` and `ON CONFLICT` patterns.

## Development & Production Deployment

```bash
# Install dependencies
npm install

# Run development server (Express + Vite middleware on port 3000)
npm run dev

# Build frontend bundle for production
npm run build

# Start production server
NODE_ENV=production npm start
```

## Vercel Deployment

`vercel.json` and `api/index.ts` route all `/api/*` endpoints to the Express serverless handler and serve the built Vite frontend from `dist/`.

1. In **Vercel → Project Settings → Environment Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `IMGBB_API_KEY`
2. Trigger a **Redeploy** so both the frontend build (`VITE_*`) and serverless API pick up the environment variables.

