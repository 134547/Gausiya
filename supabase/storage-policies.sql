-- ============================================================================
-- Madrasa Ghausia Razvia — Supabase Storage Buckets & Policies
-- Run in Supabase SQL Editor AFTER rls-policies.sql (Stage 3: Storage)
-- ============================================================================

-- Public display buckets (public = true for institutional / non-confidential imagery)
-- Private sensitive buckets (public = false — MUST be accessed via signed URLs)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('student-photos', 'student-photos', FALSE, 5242880),
  ('teacher-photos', 'teacher-photos', TRUE, 5242880),
  ('admission-documents', 'admission-documents', FALSE, 10485760),
  ('student-documents', 'student-documents', FALSE, 10485760),
  ('notices', 'notices', TRUE, 10485760),
  ('programs', 'programs', TRUE, 10485760),
  ('feed-images', 'feed-images', TRUE, 10485760),
  ('chat-attachments', 'chat-attachments', FALSE, 10485760),
  ('madrasa-assets', 'madrasa-assets', TRUE, 5242880)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

-- Public read policies ONLY for public institutional buckets
CREATE POLICY storage_public_read_buckets ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id IN ('teacher-photos', 'notices', 'programs', 'feed-images', 'madrasa-assets'));

-- Authenticated read for student photos (teachers, committee, super_admin, own student/parent)
CREATE POLICY storage_student_photos_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-photos'
    AND (
      public.is_super_admin()
      OR public.current_user_role() IN ('teacher', 'committee_member', 'parent', 'student')
    )
  );

-- Private document buckets: NEVER publicly accessible; Super Admin + authorized owners only
CREATE POLICY storage_private_docs_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('admission-documents', 'student-documents', 'chat-attachments')
    AND (
      public.is_super_admin()
      OR owner = auth.uid()
      OR (bucket_id = 'chat-attachments' AND auth.role() = 'authenticated')
    )
  );

-- Upload policies
CREATE POLICY storage_admin_manage_all ON storage.objects
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY storage_staff_uploads ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('notices', 'programs', 'feed-images', 'chat-attachments', 'student-photos', 'teacher-photos', 'student-documents', 'admission-documents')
    AND public.current_user_role() IN ('super_admin', 'teacher', 'committee_member', 'parent', 'student')
  );

-- Allow anonymous public admission applicants to upload applicant photo/docs into admission-documents only
CREATE POLICY storage_public_admission_upload ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'admission-documents');
