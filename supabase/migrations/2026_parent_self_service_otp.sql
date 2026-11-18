-- ============================================================================
-- Madrasa Gausiya Razvia — Parent Self-Registration & OTP Child Linking SQL
-- Run this idempotent script in Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================================

-- 1. Ensure Parent role & linked_type constraint exist
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_slug_check;
ALTER TABLE public.roles
  ADD CONSTRAINT roles_slug_check
  CHECK (slug IN ('super_admin', 'teacher', 'parent', 'student', 'committee_member', 'public'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_linked_type_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_linked_type_check
  CHECK (linked_type IN ('student', 'teacher', 'parent', 'committee', 'admin', 'public'));

INSERT INTO public.roles (name, slug, description)
VALUES (
  'Parent',
  'parent',
  'Access to linked children profiles, attendance, results, homework, syllabus, and notices'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 2. Ensure Parent permissions are assigned cleanly
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'view_students', 'view_attendance', 'view_results', 'submit_homework', 'use_chats'
)
WHERE r.slug = 'parent'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3. Ensure Student columns for Student ID / Admission No / Portal Credentials exist
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS admission_no TEXT,
  ADD COLUMN IF NOT EXISTS admission_number TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS roll_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. Ensure Parents & Student Guardians tables + fast lookup indexes exist
CREATE TABLE IF NOT EXISTS public.parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_code TEXT NOT NULL UNIQUE,
  user_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  mobile TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  relationship TEXT NOT NULL DEFAULT 'Father',
  occupation TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.student_guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'Father',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, parent_id)
);

-- 5. Indexes for fast OTP notifications & parent child lookups
CREATE INDEX IF NOT EXISTS idx_parents_user_id ON public.parents(user_id);
CREATE INDEX IF NOT EXISTS idx_sg_parent ON public.student_guardians(parent_id);
CREATE INDEX IF NOT EXISTS idx_sg_student ON public.student_guardians(student_id);
CREATE INDEX IF NOT EXISTS idx_notif_user_type ON public.notifications(user_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_parent_otp
  ON public.documents(entity_type, title, file_type, uploaded_by)
  WHERE title = 'PARENT_LINK_OTP';

-- 6. Ensure notifications RLS policy allows users to read & mark their own OTP alerts read
DROP POLICY IF EXISTS notifications_own ON public.notifications;
CREATE POLICY notifications_own ON public.notifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin());
