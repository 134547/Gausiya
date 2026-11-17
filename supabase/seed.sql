-- ============================================================================
-- Madrasa Gausiya Razvia — Initial Seed Data (Roles, Permissions, Settings ONLY)
-- IMPORTANT: Contains NO fake student, teacher, or parent records.
-- Run in Supabase SQL Editor AFTER schema.sql, rls-policies.sql, storage-policies.sql
-- ============================================================================

-- 1. Core Portal Roles
INSERT INTO public.roles (name, slug, description)
VALUES
  ('Super Admin', 'super_admin', 'Full unrestricted system access'),
  ('Teacher', 'teacher', 'Access to assigned classes, attendance, homework, and marks'),
  ('Parent', 'parent', 'Access to linked children profiles, attendance, results, homework, and notices'),
  ('Student', 'student', 'Access to personal profile, attendance, results, homework, and notices'),
  ('Committee Member', 'committee_member', 'Access to committee directory, programs, notices, and reports'),
  ('Public', 'public', 'Public account access to feed, notices, programs, committee, and contact information')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 2. Granular Permissions
INSERT INTO public.permissions (code, module, description)
VALUES
  ('manage_settings', 'super_admin', 'Manage madrasa settings and logo'),
  ('manage_users', 'login_details', 'Create, edit, disable, and reset user accounts'),
  ('manage_admissions', 'admissions', 'Manage and approve student admissions'),
  ('manage_students', 'students', 'Full CRUD and promotion for students'),
  ('view_students', 'students', 'View permitted student records'),
  ('manage_teachers', 'teachers', 'Full CRUD for teachers and assignments'),
  ('manage_parents', 'parents', 'Full CRUD for parents and guardian links'),
  ('manage_classes', 'classes', 'Manage classes and transfers'),
  ('manage_subjects', 'subjects', 'Manage subjects and curriculum'),
  ('mark_attendance', 'attendance', 'Mark and update student attendance'),
  ('view_attendance', 'attendance', 'View attendance records'),
  ('manage_exams', 'examinations', 'Create and schedule examinations'),
  ('enter_marks', 'results', 'Enter student examination marks'),
  ('publish_results', 'results', 'Approve and publish final marksheets'),
  ('view_results', 'results', 'View published results'),
  ('manage_committee', 'committee', 'Manage madrasa committee members'),
  ('manage_homework', 'homework', 'Create homework and review submissions'),
  ('submit_homework', 'homework', 'View and submit assigned homework'),
  ('manage_online_classes', 'online_classes', 'Schedule online classes'),
  ('manage_notices', 'notices', 'Publish and manage notices'),
  ('manage_programs', 'programs', 'Create and manage programs/events'),
  ('manage_feed', 'feed', 'Publish and moderate feed posts'),
  ('view_reports', 'reports', 'Generate and export reports'),
  ('view_activity_logs', 'activity_logs', 'Inspect system audit trail'),
  ('use_chats', 'chats', 'Send and receive internal messages')
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  description = EXCLUDED.description;

-- 3. Default Role -> Permission Matrix
-- Super Admin gets all permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.slug = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Teacher permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'view_students', 'mark_attendance', 'view_attendance',
  'enter_marks', 'view_results', 'manage_homework',
  'manage_online_classes', 'use_chats'
)
WHERE r.slug = 'teacher'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Parent permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'view_students', 'view_attendance', 'view_results', 'submit_homework', 'use_chats'
)
WHERE r.slug = 'parent'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Student permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'view_attendance', 'view_results', 'submit_homework'
)
WHERE r.slug = 'student'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Committee Member permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'view_reports', 'manage_committee', 'manage_programs', 'use_chats'
)
WHERE r.slug = 'committee_member'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. Default Institutional Settings (Singleton Row id = 1)
INSERT INTO public.madrasa_settings (
  id, name, name_urdu, address, address_urdu, phone, email, website, logo_url, grading_rules_json
)
VALUES (
  1,
  'Madrasa Gausiya Razvia',
  'مدرسہ غوثیہ رضویہ',
  'Islamnagar, Ramgarh, (P.S.) Ramgarh, (P.O.) Ramgarh, Palamu, Jharkhand, India, 822110',
  'اسلام نگر، رام گڑھ، پلاموں، جھارکھنڈ، انڈیا',
  '+91 62027 36648',
  'dil.dil.a.1345@gmail.com',
  'https://gausiya.zite.so',
  '/assets/aistudio/ChatGPT_Image_Nov_6__2026__09_59_52_PM_bd16f337.png',
  '[
    {"grade":"A+","minPercent":90,"remark":"Mumtaz (Distinction)"},
    {"grade":"A","minPercent":80,"remark":"Jayyid Jiddan (Excellent)"},
    {"grade":"B","minPercent":70,"remark":"Jayyid (Very Good)"},
    {"grade":"C","minPercent":60,"remark":"Maqbool (Good)"},
    {"grade":"D","minPercent":45,"remark":"Pass"},
    {"grade":"E","minPercent":33,"remark":"Marginal Pass"},
    {"grade":"F","minPercent":0,"remark":"Fail"}
  ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;
