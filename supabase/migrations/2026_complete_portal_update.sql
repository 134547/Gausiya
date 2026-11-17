-- ============================================================================
-- Madrasa Gausiya Razvia Portal — Complete Idempotent Database Update Script
-- Run this once in Supabase Dashboard -> SQL Editor -> New Query
-- Safe to re-run: preserves all existing tables and data.
-- ============================================================================

-- 1. Enable 'public' role + 'student' role & update constraints
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_slug_check;
ALTER TABLE public.roles
  ADD CONSTRAINT roles_slug_check
  CHECK (slug IN ('super_admin', 'teacher', 'parent', 'student', 'committee_member', 'public'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_linked_type_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_linked_type_check
  CHECK (linked_type IN ('student', 'teacher', 'parent', 'committee', 'admin', 'public'));

INSERT INTO public.roles (name, slug, description)
VALUES
  ('Student', 'student', 'Access to personal profile, attendance, results, homework, syllabus, and notices'),
  ('Public', 'public', 'Public account access to feed, notices, programs, syllabus, committee, and contact information')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 2. Institutional Portal Toggles & Name Update in madrasa_settings
ALTER TABLE public.madrasa_settings
  ADD COLUMN IF NOT EXISTS admissions_open BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS results_open BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS chats_open BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.madrasa_settings
SET name = regexp_replace(name, 'Ghausia', 'Gausiya', 'gi')
WHERE name ~* 'Ghausia';

-- 3. Profiles: Student admission automatic account + approval tracking columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_approval_status_check;
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_approval_status_check
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));
EXCEPTION WHEN others THEN NULL;
END $$;

UPDATE public.profiles
SET
  auth_user_id = COALESCE(auth_user_id, id),
  approval_status = CASE
    WHEN status = 'active' THEN 'approved'
    WHEN status = 'disabled' THEN 'rejected'
    ELSE 'pending'
  END
WHERE auth_user_id IS NULL OR approval_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_profiles_approval_status ON public.profiles(approval_status);

-- 4. Students: pending/disabled status support + roll_number, username & approval tracking
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS roll_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admission_number TEXT,
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_status_check;
  ALTER TABLE public.students
    ADD CONSTRAINT students_status_check
    CHECK (status IN ('pending', 'active', 'inactive', 'disabled', 'transferred', 'graduated'));

  ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_approval_status_check;
  ALTER TABLE public.students
    ADD CONSTRAINT students_approval_status_check
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));
EXCEPTION WHEN others THEN NULL;
END $$;

UPDATE public.students s
SET
  auth_user_id = COALESCE(s.auth_user_id, s.user_id),
  admission_number = COALESCE(s.admission_number, s.admission_no),
  username = COALESCE(s.username, p.username),
  approval_status = CASE
    WHEN s.status = 'pending' THEN 'pending'
    WHEN s.status = 'disabled' THEN 'rejected'
    ELSE COALESCE(NULLIF(s.approval_status, ''), 'approved')
  END
FROM public.profiles p
WHERE s.user_id = p.id;

UPDATE public.profiles p
SET
  linked_id = s.id,
  linked_type = 'student'
FROM public.students s
WHERE s.user_id = p.id
  AND s.deleted_at IS NULL
  AND (p.linked_id IS NULL OR p.linked_type IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_username_unique
  ON public.students(username)
  WHERE username IS NOT NULL AND username <> '';
CREATE INDEX IF NOT EXISTS idx_students_approval_status ON public.students(approval_status);

-- 5. Admissions: linked username/auth_user_id + explicit approval/rejection metadata
ALTER TABLE public.admissions
  ADD COLUMN IF NOT EXISTS username TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admission_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  ALTER TABLE public.admissions DROP CONSTRAINT IF EXISTS admissions_approval_status_check;
  ALTER TABLE public.admissions
    ADD CONSTRAINT admissions_approval_status_check
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));
EXCEPTION WHEN others THEN NULL;
END $$;

UPDATE public.admissions
SET
  approval_status = status,
  approved_by = CASE WHEN status = 'approved' THEN COALESCE(approved_by, reviewed_by) ELSE approved_by END,
  approved_at = CASE WHEN status = 'approved' THEN COALESCE(approved_at, reviewed_at) ELSE approved_at END,
  rejected_by = CASE WHEN status = 'rejected' THEN COALESCE(rejected_by, reviewed_by) ELSE rejected_by END,
  rejected_at = CASE WHEN status = 'rejected' THEN COALESCE(rejected_at, reviewed_at) ELSE rejected_at END;

CREATE INDEX IF NOT EXISTS idx_admissions_student_id ON public.admissions(student_id);

-- 6. RLS Helper Functions + Syllabus Documents Read Policy
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.slug
  FROM public.profiles p
  JOIN public.roles r ON r.id = p.role_id
  WHERE p.id = auth.uid()
    AND p.status = 'active'
    AND p.approval_status = 'approved'
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.students s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE s.user_id = auth.uid()
    AND s.deleted_at IS NULL
    AND s.status = 'active'
    AND s.approval_status = 'approved'
    AND p.status = 'active'
    AND p.approval_status = 'approved'
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

DROP POLICY IF EXISTS documents_read ON public.documents;
CREATE POLICY documents_read ON public.documents
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (entity_type = 'general' AND title = 'SYLLABUS_ITEM')
    OR (entity_type = 'student' AND (entity_id = public.current_student_id() OR public.parent_has_student(entity_id)))
  );

-- 7. Ensure Storage Buckets exist for Syllabus Cover Pages, PDFs, Photos & Documents
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('notices', 'notices', TRUE, 10485760),
  ('madrasa-assets', 'madrasa-assets', TRUE, 5242880)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;
