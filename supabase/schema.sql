-- ============================================================================
-- Madrasa Ghausia Razvia — Complete PostgreSQL Schema for Supabase
-- Run in Supabase SQL Editor (Stage 1: Schema)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Automatic updated_at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 1. USER AND PERMISSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE CHECK (slug IN ('super_admin', 'teacher', 'parent', 'student', 'committee_member')),
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role_id, permission_id)
);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role_id);

-- Linked directly to auth.users(id). Never store passwords or session tokens here.
-- New self-registered or OAuth users start with role_id = NULL and status = 'pending'
-- until a Super Admin explicitly assigns an authorized role and activates the account.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_code TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL DEFAULT '',
  mobile TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL,
  role_id UUID REFERENCES public.roles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'disabled', 'pending')),
  linked_type TEXT CHECK (linked_type IN ('student', 'teacher', 'parent', 'committee', 'admin')),
  linked_id UUID,
  father_name TEXT NOT NULL DEFAULT '',
  dob TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT 'Male',
  address TEXT NOT NULL DEFAULT '',
  village TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL DEFAULT 'Palamu',
  state TEXT NOT NULL DEFAULT 'Jharkhand',
  pin_code TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

-- Trigger to ensure every auth.users entry gets a safe, unprivileged pending profile if not pre-created
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username TEXT;
  v_code TEXT;
  v_name TEXT;
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    split_part(COALESCE(NEW.email, 'user'), '@', 1),
    'Portal User'
  );
  v_username := regexp_replace(lower(split_part(COALESCE(NEW.email, 'user'), '@', 1)), '[^a-z0-9._-]', '', 'g');
  IF v_username = '' OR EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) THEN
    v_username := COALESCE(NULLIF(v_username, ''), 'user') || '_' || substr(replace(NEW.id::text, '-', ''), 1, 6);
  END IF;
  v_code := 'USR-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 6));

  INSERT INTO public.profiles (id, user_code, username, email, full_name, role_id, status, photo_url)
  VALUES (
    NEW.id,
    v_code,
    v_username,
    COALESCE(NEW.email, ''),
    v_name,
    NULL,
    'pending',
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture', '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================================
-- 2. ACADEMIC MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.academic_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_code TEXT NOT NULL UNIQUE,
  user_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  father_name TEXT NOT NULL DEFAULT '',
  dob TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT 'Male',
  mobile TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  qualification TEXT NOT NULL DEFAULT '',
  joining_date DATE NOT NULL DEFAULT CURRENT_DATE,
  photo_url TEXT NOT NULL DEFAULT '',
  employment_status TEXT NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active', 'inactive', 'on_leave')),
  remarks TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_teachers_status ON public.teachers(employment_status);

CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  academic_session_id UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  class_teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  room_no TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_classes_session ON public.classes(academic_session_id);

CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  total_marks INTEGER NOT NULL DEFAULT 100 CHECK (total_marks > 0),
  passing_marks INTEGER NOT NULL DEFAULT 33 CHECK (passing_marks >= 0 AND passing_marks <= total_marks),
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.class_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  total_marks INTEGER NOT NULL DEFAULT 100 CHECK (total_marks > 0),
  passing_marks INTEGER NOT NULL DEFAULT 33 CHECK (passing_marks >= 0 AND passing_marks <= total_marks),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, subject_id)
);

CREATE TABLE IF NOT EXISTS public.teacher_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  academic_session_id UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  is_class_teacher BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (teacher_id, class_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_ta_teacher ON public.teacher_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_ta_class ON public.teacher_assignments(class_id);

CREATE TABLE IF NOT EXISTS public.parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_code TEXT NOT NULL UNIQUE,
  user_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  relationship TEXT NOT NULL DEFAULT 'Father',
  occupation TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_parents_mobile ON public.parents(mobile);

CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_code TEXT NOT NULL UNIQUE,
  admission_no TEXT UNIQUE,
  user_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  father_name TEXT NOT NULL,
  mother_name TEXT NOT NULL DEFAULT '',
  dob TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT 'Male',
  religion TEXT NOT NULL DEFAULT 'Islam',
  address TEXT NOT NULL DEFAULT '',
  village TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL DEFAULT 'Palamu',
  state TEXT NOT NULL DEFAULT 'Jharkhand',
  pin_code TEXT NOT NULL DEFAULT '',
  mobile TEXT NOT NULL DEFAULT '',
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  academic_session_id UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  admission_date DATE NOT NULL DEFAULT CURRENT_DATE,
  photo_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'transferred', 'graduated')),
  previous_school TEXT NOT NULL DEFAULT '',
  previous_class TEXT NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_students_class ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);

CREATE TABLE IF NOT EXISTS public.student_guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'Father',
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, parent_id)
);
CREATE INDEX IF NOT EXISTS idx_sg_parent ON public.student_guardians(parent_id);

CREATE TABLE IF NOT EXISTS public.student_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  from_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  to_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  from_session_id UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  to_session_id UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL DEFAULT 'promote' CHECK (action_type IN ('promote', 'transfer', 'demote')),
  remarks TEXT NOT NULL DEFAULT '',
  promoted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promotions_student ON public.student_promotions(student_id);

CREATE TABLE IF NOT EXISTS public.admissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_no TEXT NOT NULL UNIQUE,
  student_name TEXT NOT NULL,
  father_name TEXT NOT NULL,
  mother_name TEXT NOT NULL DEFAULT '',
  dob TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT 'Male',
  religion TEXT NOT NULL DEFAULT 'Islam',
  address TEXT NOT NULL DEFAULT '',
  village TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL DEFAULT 'Palamu',
  state TEXT NOT NULL DEFAULT 'Jharkhand',
  pin_code TEXT NOT NULL DEFAULT '',
  student_mobile TEXT NOT NULL DEFAULT '',
  guardian_name TEXT NOT NULL,
  guardian_relationship TEXT NOT NULL DEFAULT 'Father',
  guardian_mobile TEXT NOT NULL,
  previous_school TEXT NOT NULL DEFAULT '',
  previous_class TEXT NOT NULL DEFAULT '',
  admission_date DATE NOT NULL DEFAULT CURRENT_DATE,
  admission_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  photo_url TEXT NOT NULL DEFAULT '',
  documents_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  remarks TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_admissions_status ON public.admissions(status);

-- ============================================================================
-- 3. ATTENDANCE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_session_id UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'leave')),
  remark TEXT NOT NULL DEFAULT '',
  marked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, class_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON public.attendance(class_id, attendance_date);

CREATE TABLE IF NOT EXISTS public.teacher_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'leave')),
  remark TEXT NOT NULL DEFAULT '',
  marked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_teacher_att_date ON public.teacher_attendance(attendance_date);

-- ============================================================================
-- 4. EXAMINATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.examinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  exam_type TEXT NOT NULL DEFAULT 'Term Exam',
  academic_session_id UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE,
  instructions TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
  results_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_exams_class ON public.examinations(class_id);

CREATE TABLE IF NOT EXISTS public.examination_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id UUID NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  exam_date DATE NOT NULL,
  start_time TEXT NOT NULL DEFAULT '09:00',
  end_time TEXT NOT NULL DEFAULT '12:00',
  total_marks INTEGER NOT NULL DEFAULT 100 CHECK (total_marks > 0),
  passing_marks INTEGER NOT NULL DEFAULT 33 CHECK (passing_marks >= 0 AND passing_marks <= total_marks),
  room_no TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (examination_id, subject_id)
);

CREATE TABLE IF NOT EXISTS public.marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id UUID NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  examination_subject_id UUID REFERENCES public.examination_subjects(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  obtained_marks NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (obtained_marks >= 0),
  total_marks NUMERIC(6,2) NOT NULL DEFAULT 100 CHECK (total_marks > 0),
  is_absent BOOLEAN NOT NULL DEFAULT FALSE,
  remarks TEXT NOT NULL DEFAULT '',
  entered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (examination_id, student_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_marks_exam_student ON public.marks(examination_id, student_id);

CREATE TABLE IF NOT EXISTS public.results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id UUID NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  total_marks NUMERIC(8,2) NOT NULL DEFAULT 0,
  obtained_marks NUMERIC(8,2) NOT NULL DEFAULT 0,
  percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  grade TEXT NOT NULL DEFAULT 'F',
  status TEXT NOT NULL DEFAULT 'fail' CHECK (status IN ('pass', 'fail')),
  position INTEGER NOT NULL DEFAULT 0,
  teacher_remarks TEXT NOT NULL DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (examination_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_results_student ON public.results(student_id);

-- ============================================================================
-- 5. COMMUNICATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'private' CHECK (type IN ('private', 'group')),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cp_user ON public.conversation_participants(user_id);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  attachment_url TEXT NOT NULL DEFAULT '',
  attachment_name TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON public.messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link_module TEXT NOT NULL DEFAULT 'dashboard',
  reference_id TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user_read ON public.notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  role_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  record_id TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_module ON public.activity_logs(module, created_at DESC);

-- ============================================================================
-- 6. HOMEWORK AND ONLINE CLASSES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.homework (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  attachment_url TEXT NOT NULL DEFAULT '',
  attachment_name TEXT NOT NULL DEFAULT '',
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  submission_deadline DATE NOT NULL,
  allow_submission BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_homework_class ON public.homework(class_id);

CREATE TABLE IF NOT EXISTS public.homework_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id UUID NOT NULL REFERENCES public.homework(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  submission_text TEXT NOT NULL DEFAULT '',
  attachment_url TEXT NOT NULL DEFAULT '',
  attachment_name TEXT NOT NULL DEFAULT '',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  feedback TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'resubmit')),
  UNIQUE (homework_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.online_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  meeting_date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'Google Meet',
  meeting_url TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_online_classes_class ON public.online_classes(class_id);

-- ============================================================================
-- 7. NOTICES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  publish_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date TEXT NOT NULL DEFAULT '',
  attachment_url TEXT NOT NULL DEFAULT '',
  attachment_name TEXT NOT NULL DEFAULT '',
  target_audience TEXT NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all', 'teachers', 'students', 'parents', 'class')),
  target_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.notice_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id UUID NOT NULL REFERENCES public.notices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  UNIQUE (notice_id, user_id)
);

-- ============================================================================
-- 8. COMMITTEE AND PROGRAMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.committee_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  designation TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  joining_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  program_date DATE NOT NULL,
  start_time TEXT NOT NULL DEFAULT '',
  venue TEXT NOT NULL DEFAULT 'Madrasa Campus, Islamnagar',
  category TEXT NOT NULL DEFAULT 'Religious Gathering',
  featured_photo TEXT NOT NULL DEFAULT '',
  gallery_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- 9. SOCIAL FEED
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.feed_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  images_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  likes_count INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.feed_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.feed_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- 10. DOCUMENTS AND SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('student', 'teacher', 'admission', 'notice', 'general')),
  entity_id UUID NOT NULL,
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT '',
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON public.documents(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS public.madrasa_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  name_urdu TEXT NOT NULL,
  address TEXT NOT NULL,
  address_urdu TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  admissions_open BOOLEAN NOT NULL DEFAULT TRUE,
  results_open BOOLEAN NOT NULL DEFAULT TRUE,
  chats_open BOOLEAN NOT NULL DEFAULT TRUE,
  grading_rules_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_session_id UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Attach updated_at triggers
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'roles', 'profiles', 'academic_sessions', 'teachers', 'classes', 'subjects',
    'class_subjects', 'parents', 'students', 'admissions', 'attendance',
    'teacher_attendance', 'examinations', 'examination_subjects', 'marks',
    'results', 'conversations', 'homework', 'online_classes', 'notices',
    'committee_members', 'programs', 'feed_posts', 'madrasa_settings'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t, t);
  END LOOP;
END;
$$;
