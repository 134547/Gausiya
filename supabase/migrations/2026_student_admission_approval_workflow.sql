-- ============================================================================
-- Migration: Student Admission Automatic Account Creation & Approval Workflow
-- Safe & idempotent: adds missing fields/constraints to existing tables only.
-- ============================================================================

-- 1. Profiles: approval tracking + explicit auth_user_id mirror
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

-- 2. Students: pending/disabled status support + username & approval tracking
ALTER TABLE public.students
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_username_unique
  ON public.students(username)
  WHERE username IS NOT NULL AND username <> '';
CREATE INDEX IF NOT EXISTS idx_students_approval_status ON public.students(approval_status);

-- 3. Admissions: linked username/auth_user_id + explicit approval/rejection metadata
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

-- 4. Update RLS helper functions so pending/rejected/disabled student accounts stay strictly blocked
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
