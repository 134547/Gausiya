export type RoleSlug = 'super_admin' | 'teacher' | 'parent' | 'student' | 'committee_member' | 'public';

export type NavModuleId =
  | 'super_admin'
  | 'dashboard'
  | 'my_child'
  | 'chats'
  | 'committee'
  | 'admissions'
  | 'login_details'
  | 'students'
  | 'teachers'
  | 'id_cards'
  | 'parents'
  | 'classes'
  | 'subjects'
  | 'syllabus'
  | 'schedules'
  | 'attendance'
  | 'examinations'
  | 'results'
  | 'programs'
  | 'homework'
  | 'online_classes'
  | 'notices'
  | 'feed'
  | 'reports'
  | 'activity_logs'
  | 'contact_us'
  | 'profile';

export interface User {
  id: string;
  user_code: string;
  username: string;
  email: string;
  mobile: string;
  full_name: string;
  role_id: string;
  role_name: string;
  role_slug: RoleSlug;
  linked_type: string | null;
  linked_id: string | null;
  status: string;
  permissions: string[];
  photo_url?: string;
}

export interface GradingRule {
  grade: string;
  minPercent: number;
  remark?: string;
}

export interface MadrasaSettings {
  id: number;
  name: string;
  name_urdu: string;
  address: string;
  address_urdu: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
  admissions_open?: boolean;
  results_open?: boolean;
  chats_open?: boolean;
  grading_rules_json: string;
  active_session_id: string | null;
}

export interface AcademicSession {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean | number;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link_module: NavModuleId;
  reference_id: string | null;
  is_read: boolean | number;
  created_at: string;
}
