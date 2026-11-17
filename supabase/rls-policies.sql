-- ============================================================================
-- Madrasa Ghausia Razvia — Row Level Security (RLS) Policies
-- Run in Supabase SQL Editor AFTER schema.sql (Stage 2: RLS)
-- ============================================================================

-- Helper functions evaluated cleanly with SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'super_admin', FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_committee_member()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'committee_member', FALSE);
$$;

CREATE OR REPLACE FUNCTION public.current_teacher_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.teachers
  WHERE user_id = auth.uid() AND deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_parent_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.parents
  WHERE user_id = auth.uid() AND deleted_at IS NULL
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

CREATE OR REPLACE FUNCTION public.teacher_teaches_class(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    WHERE ta.teacher_id = public.current_teacher_id() AND ta.class_id = p_class_id
  )
  OR EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = p_class_id AND c.class_teacher_id = public.current_teacher_id() AND c.deleted_at IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM public.class_subjects cs
    WHERE cs.class_id = p_class_id AND cs.teacher_id = public.current_teacher_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.parent_has_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_guardians sg
    WHERE sg.parent_id = public.current_parent_id() AND sg.student_id = p_student_id
  );
$$;

-- Enable RLS across every table
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notice_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.madrasa_settings ENABLE ROW LEVEL SECURITY;

-- 1. Roles & Permissions
CREATE POLICY roles_read ON public.roles FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY roles_admin ON public.roles FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY permissions_read ON public.permissions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY permissions_admin ON public.permissions FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY role_permissions_read ON public.role_permissions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY role_permissions_admin ON public.role_permissions FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- 2. Profiles (Users can read own profile + update own safe fields ONLY, never role_id/status/linked_*)
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_super_admin() OR public.current_user_role() IN ('teacher', 'committee_member'));

CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role_id IS NOT DISTINCT FROM (SELECT p.role_id FROM public.profiles p WHERE p.id = auth.uid())
    AND status IS NOT DISTINCT FROM (SELECT p.status FROM public.profiles p WHERE p.id = auth.uid())
    AND linked_type IS NOT DISTINCT FROM (SELECT p.linked_type FROM public.profiles p WHERE p.id = auth.uid())
    AND linked_id IS NOT DISTINCT FROM (SELECT p.linked_id FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY profiles_admin_all ON public.profiles FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- 3. Academic Sessions, Classes, Subjects, Settings (Public/Authenticated read where appropriate, Admin write)
CREATE POLICY sessions_read ON public.academic_sessions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY sessions_admin ON public.academic_sessions FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY settings_public_read ON public.madrasa_settings FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY settings_admin ON public.madrasa_settings FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY classes_public_read ON public.classes FOR SELECT TO anon, authenticated USING (deleted_at IS NULL);
CREATE POLICY classes_admin ON public.classes FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY subjects_read ON public.subjects FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY subjects_admin ON public.subjects FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY class_subjects_read ON public.class_subjects FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY class_subjects_admin ON public.class_subjects FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY teacher_assignments_read ON public.teacher_assignments FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY teacher_assignments_admin ON public.teacher_assignments FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- 4. Teachers
CREATE POLICY teachers_read ON public.teachers FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY teachers_admin ON public.teachers FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- 5. Parents & Student Guardians
CREATE POLICY parents_read ON public.parents FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      public.is_super_admin()
      OR public.is_committee_member()
      OR user_id = auth.uid()
      OR public.current_user_role() = 'teacher'
    )
  );
CREATE POLICY parents_admin ON public.parents FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY student_guardians_read ON public.student_guardians FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_committee_member()
    OR parent_id = public.current_parent_id()
    OR student_id = public.current_student_id()
  );
CREATE POLICY student_guardians_admin ON public.student_guardians FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- 6. Students & Promotions
CREATE POLICY students_read ON public.students FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      public.is_super_admin()
      OR public.is_committee_member()
      OR user_id = auth.uid()
      OR public.parent_has_student(id)
      OR (public.current_user_role() = 'teacher' AND public.teacher_teaches_class(class_id))
    )
  );
CREATE POLICY students_admin ON public.students FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY promotions_read ON public.student_promotions FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR student_id = public.current_student_id()
    OR public.parent_has_student(student_id)
  );
CREATE POLICY promotions_admin ON public.student_promotions FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- 7. Admissions (Public can submit pending admission; only Super Admin / Committee read; Super Admin write)
CREATE POLICY admissions_public_insert ON public.admissions FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending' AND student_id IS NULL AND reviewed_by IS NULL);
CREATE POLICY admissions_read ON public.admissions FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (public.is_super_admin() OR public.is_committee_member()));
CREATE POLICY admissions_admin ON public.admissions FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY admissions_admin_del ON public.admissions FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- 8. Attendance & Teacher Attendance
CREATE POLICY attendance_read ON public.attendance FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_committee_member()
    OR student_id = public.current_student_id()
    OR public.parent_has_student(student_id)
    OR (public.current_user_role() = 'teacher' AND public.teacher_teaches_class(class_id))
  );
CREATE POLICY attendance_write ON public.attendance FOR ALL TO authenticated
  USING (public.is_super_admin() OR (public.current_user_role() = 'teacher' AND public.teacher_teaches_class(class_id)))
  WITH CHECK (public.is_super_admin() OR (public.current_user_role() = 'teacher' AND public.teacher_teaches_class(class_id)));

CREATE POLICY teacher_attendance_admin ON public.teacher_attendance FOR ALL TO authenticated
  USING (public.is_super_admin() OR teacher_id = public.current_teacher_id())
  WITH CHECK (public.is_super_admin());

-- 9. Examinations, Marks, Results
CREATE POLICY exams_read ON public.examinations FOR SELECT TO anon, authenticated USING (deleted_at IS NULL);
CREATE POLICY exams_admin ON public.examinations FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY exam_subjects_read ON public.examination_subjects FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY exam_subjects_admin ON public.examination_subjects FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY marks_read ON public.marks FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (public.current_user_role() = 'teacher')
    OR (
      (student_id = public.current_student_id() OR public.parent_has_student(student_id))
      AND EXISTS (SELECT 1 FROM public.results r WHERE r.examination_id = marks.examination_id AND r.student_id = marks.student_id AND r.is_published = TRUE)
    )
  );
CREATE POLICY marks_write ON public.marks FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.current_user_role() = 'teacher')
  WITH CHECK (public.is_super_admin() OR public.current_user_role() = 'teacher');

CREATE POLICY results_read ON public.results FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (public.current_user_role() = 'teacher' AND public.teacher_teaches_class(class_id))
    OR (is_published = TRUE AND (public.is_committee_member() OR student_id = public.current_student_id() OR public.parent_has_student(student_id)))
  );
CREATE POLICY results_write ON public.results FOR ALL TO authenticated
  USING (public.is_super_admin() OR (public.current_user_role() = 'teacher' AND public.teacher_teaches_class(class_id)))
  WITH CHECK (public.is_super_admin() OR (public.current_user_role() = 'teacher' AND public.teacher_teaches_class(class_id)));

-- 10. Homework & Online Classes
CREATE POLICY homework_read ON public.homework FOR SELECT TO authenticated
  USING (deleted_at IS NULL);
CREATE POLICY homework_write ON public.homework FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.current_user_role() = 'teacher')
  WITH CHECK (public.is_super_admin() OR public.current_user_role() = 'teacher');

CREATE POLICY hw_submissions_read ON public.homework_submissions FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.current_user_role() = 'teacher'
    OR student_id = public.current_student_id()
    OR public.parent_has_student(student_id)
  );
CREATE POLICY hw_submissions_student_write ON public.homework_submissions FOR INSERT TO authenticated
  WITH CHECK (student_id = public.current_student_id() OR public.parent_has_student(student_id) OR public.is_super_admin());
CREATE POLICY hw_submissions_update ON public.homework_submissions FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR public.current_user_role() = 'teacher'
    OR student_id = public.current_student_id()
    OR public.parent_has_student(student_id)
  );

CREATE POLICY online_classes_read ON public.online_classes FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY online_classes_write ON public.online_classes FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.current_user_role() = 'teacher')
  WITH CHECK (public.is_super_admin() OR public.current_user_role() = 'teacher');

-- 11. Chats, Notifications, Activity Logs
CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conv_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = p_conv_id
      AND user_id = auth.uid()
  );
$$;

CREATE POLICY conv_read ON public.conversations FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_conversation_participant(id)
  );
CREATE POLICY conv_create ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY cp_read ON public.conversation_participants FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_conversation_participant(conversation_id)
    OR public.is_super_admin()
  );
CREATE POLICY cp_insert ON public.conversation_participants FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.created_by = auth.uid()
    )
    OR public.is_super_admin()
  );
CREATE POLICY cp_update_self ON public.conversation_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY messages_read ON public.messages FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id));
CREATE POLICY messages_insert ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_participant(conversation_id)
  );

CREATE POLICY notifications_self ON public.notifications FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

CREATE POLICY activity_logs_admin ON public.activity_logs FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- 12. Notices, Committee, Programs, Feed, Documents
CREATE POLICY notices_public_read ON public.notices FOR SELECT TO anon
  USING (deleted_at IS NULL AND target_audience = 'all');
CREATE POLICY notices_auth_read ON public.notices FOR SELECT TO authenticated
  USING (deleted_at IS NULL);
CREATE POLICY notices_write ON public.notices FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.is_committee_member())
  WITH CHECK (public.is_super_admin() OR public.is_committee_member());

CREATE POLICY notice_recipients_self ON public.notice_recipients FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

CREATE POLICY committee_public_read ON public.committee_members FOR SELECT TO anon, authenticated USING (deleted_at IS NULL);
CREATE POLICY committee_write ON public.committee_members FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.is_committee_member())
  WITH CHECK (public.is_super_admin() OR public.is_committee_member());

CREATE POLICY programs_read ON public.programs FOR SELECT TO anon, authenticated USING (deleted_at IS NULL);
CREATE POLICY programs_write ON public.programs FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.is_committee_member())
  WITH CHECK (public.is_super_admin() OR public.is_committee_member());

CREATE POLICY feed_posts_read ON public.feed_posts FOR SELECT TO anon, authenticated USING (deleted_at IS NULL);
CREATE POLICY feed_posts_write ON public.feed_posts FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.current_user_role() IN ('teacher', 'committee_member'))
  WITH CHECK (public.is_super_admin() OR public.current_user_role() IN ('teacher', 'committee_member'));

CREATE POLICY feed_likes_read ON public.feed_likes FOR SELECT TO authenticated
  USING (TRUE);
CREATE POLICY feed_likes_insert ON public.feed_likes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY feed_likes_delete ON public.feed_likes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY feed_comments_read ON public.feed_comments FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY feed_comments_insert ON public.feed_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY documents_read ON public.documents FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (entity_type = 'student' AND (entity_id = public.current_student_id() OR public.parent_has_student(entity_id)))
  );
CREATE POLICY documents_admin ON public.documents FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
