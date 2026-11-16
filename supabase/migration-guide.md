# Madrasa Ghausia Razvia — Supabase Migration Guide

This guide covers setting up your Supabase project, applying the PostgreSQL schema and security policies, configuring Google OAuth, and safely migrating existing SQLite (`data/madrasa.db`) records into Supabase without data loss or duplication.

---

## 1. Configure Environment Variables

Add the following variables to your `.env` file or AI Studio Secrets panel (see `.env.example`):

```env
VITE_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SUPABASE_SERVICE_ROLE_KEY"
IMGBB_API_KEY="YOUR_IMGBB_API_KEY"
```

> **Security Rule**: `SUPABASE_SERVICE_ROLE_KEY` and `IMGBB_API_KEY` must ONLY be configured on the server and **never** prefixed with `VITE_` or exposed in browser bundles.

---

## 2. Run SQL Setup Scripts (In Exact Order)

Open your **Supabase Dashboard -> SQL Editor** and execute each script in order:

1. `supabase/schema.sql` — Creates all 38 PostgreSQL tables (UUID PKs, foreign keys, CHECK constraints, indexes, `updated_at` triggers, and the `auth.users -> public.profiles` trigger).
2. `supabase/rls-policies.sql` — Enables Row Level Security on every table and configures least-privilege role helpers (`super_admin`, `teacher`, `parent`, `student`, `committee_member`).
3. `supabase/storage-policies.sql` — Provisions all 9 storage buckets (`student-photos`, `teacher-photos`, `admission-documents`, `student-documents`, `notices`, `programs`, `feed-images`, `chat-attachments`, `madrasa-assets`) with private/signed access for sensitive documents.
4. `supabase/seed.sql` — Seeds default roles, 25 granular permissions, role-permission mappings, and institutional `madrasa_settings` (with **zero** dummy student/teacher/parent rows).

---

## 3. Configure Supabase Authentication & Google OAuth

1. Open **Supabase Dashboard -> Authentication -> Providers**.
2. Enable **Email** provider (disable public auto-role escalation; new signups default to `status = 'pending'` and `role_id = NULL` until approved by a Super Admin in **Login Details**).
3. Enable **Google** provider and add your Google OAuth Client ID & Secret.
4. Under **Authentication -> URL Configuration**:
   - Set **Site URL** to your application URL (e.g., `http://localhost:3000` or your Cloud Run URL).
   - Add Redirect URLs for both local development and production (`https://your-app-url/**`).

---

## 4. Safely Migrate Existing SQLite Data (`data/madrasa.db`)

`data/madrasa.db` is preserved intact (read-only during migration). To transfer your existing records (sessions, classes, subjects, teachers, parents, students, admissions, attendance, exams, marks, results, committee, notices, programs, feed, chats) and provision `auth.users` accounts idempotently:

1. Ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in your shell/environment.
2. Run a dry-run export audit first (optional) or execute the idempotent migration script:

```bash
npx tsx scripts/migrate-sqlite-to-supabase.ts
```

What the script does safely:
- Reads `data/madrasa.db` in **read-only** mode (never alters or deletes SQLite data).
- Exports a backup snapshot JSON to `data/sqlite-export-backup.json` before importing.
- Uses deterministic UUID mapping (`legacy_id -> uuid`) and `ON CONFLICT` / uniqueness checks (`student_code`, `admission_no`, `teacher_code`, `parent_code`, `code`, `username`) so running it twice will **not** create duplicate records.
- Creates `auth.users` via `supabase.auth.admin.createUser` (or matches existing users by email), links `profiles.id`, and sets `role_id` + `linked_id` + `status = 'active'` for migrated accounts.
- Updates `teachers.user_id`, `parents.user_id`, `students.user_id`, and `madrasa_settings.active_session_id`.

---

## 5. Verification Checklist

- [ ] Confirm `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are configured.
- [ ] Sign in as Super Admin (`dil.dil.a.1345@gmail.com` or `dilshad1345`) and verify all 21 dashboard modules load.
- [ ] Test Google OAuth login and verify a brand-new email receives `status = 'pending'` (cannot access admin/student data until Super Admin assigns a role in **Login Details**).
- [ ] Test **Forgot Password** -> **Reset Password** email flow.
- [ ] Upload a student photo / admission document and confirm private buckets resolve via signed URLs.
- [ ] Once verified, optionally archive `data/madrasa.db` to cold storage.
