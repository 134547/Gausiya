import type { Request, Response, NextFunction } from 'express';
import { requireSupabaseAdmin, resolveStorageUrl, supabaseAdmin } from './supabase.ts';
import {
  STUDENT_PENDING_LOGIN_MESSAGE,
  STUDENT_REJECTED_LOGIN_MESSAGE,
  getStudentApprovalState,
} from './studentProvisioning.ts';

export type RoleSlug = 'super_admin' | 'teacher' | 'parent' | 'student' | 'committee_member' | 'public';

export interface AuthenticatedUser {
  id: string;
  user_code: string;
  username: string;
  email: string;
  mobile: string;
  full_name: string;
  role_id: string | null;
  role_name: string;
  role_slug: RoleSlug;
  linked_type: string | null;
  linked_id: string | null;
  status: string;
  permissions: string[];
  photo_url?: string;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
  accessToken?: string;
}

export async function getUserWithPermissions(userId: string): Promise<{
  user: AuthenticatedUser | null;
  pending?: boolean;
  pendingStudent?: boolean;
  disabled?: boolean;
  rejected?: boolean;
}> {
  if (!supabaseAdmin) return { user: null };

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !profile) return { user: null };

  const { data: role } = profile.role_id
    ? await supabaseAdmin
        .from('roles')
        .select('id, name, slug')
        .eq('id', profile.role_id)
        .maybeSingle()
    : { data: null };

  const isStudentAccount = role?.slug === 'student' || profile.linked_type === 'student';

  if (isStudentAccount) {
    const state = await getStudentApprovalState(supabaseAdmin, profile, role?.slug);
    if (state === 'pending') {
      return { user: null, pending: true, pendingStudent: true };
    }
    if (state === 'rejected') {
      return { user: null, disabled: true, rejected: true };
    }
  } else {
    if (profile.status === 'pending' || !profile.role_id) return { user: null, pending: true };
    if (profile.status !== 'active') return { user: null, disabled: true };
  }

  if (!role) return { user: null, pending: true };

  const { data: rpRows } = await supabaseAdmin
    .from('role_permissions')
    .select('permission_id, permissions(code)')
    .eq('role_id', role.id);

  const permissions = (rpRows || [])
    .map((rp: any) => rp.permissions?.code)
    .filter((c: any): c is string => Boolean(c));

  const resolvedPhoto = await resolveStorageUrl(profile.photo_url);

  return {
    user: {
      id: profile.id,
      user_code: profile.user_code,
      username: profile.username,
      email: profile.email || '',
      mobile: profile.mobile || '',
      full_name: profile.full_name,
      role_id: profile.role_id,
      role_name: role.name,
      role_slug: role.slug as RoleSlug,
      linked_type: profile.linked_type,
      linked_id: profile.linked_id,
      status: profile.status,
      permissions,
      photo_url: resolvedPhoto,
    },
  };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;

    const authHeader = req.headers.authorization;
    let token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token && req.cookies?.sb_access_token) {
      token = String(req.cookies.sb_access_token);
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired Supabase session' });
    }

    const resolved = await getUserWithPermissions(data.user.id);
    if (resolved.pendingStudent) {
      return res.status(403).json({
        error: STUDENT_PENDING_LOGIN_MESSAGE,
        code: 'ADMISSION_PENDING',
      });
    }
    if (resolved.pending) {
      return res.status(403).json({
        error: 'Your account is pending administrator approval and role assignment.',
        code: 'ACCOUNT_PENDING',
      });
    }
    if (resolved.rejected) {
      return res.status(403).json({
        error: STUDENT_REJECTED_LOGIN_MESSAGE,
        code: 'ADMISSION_REJECTED',
      });
    }
    if (resolved.disabled) {
      return res.status(403).json({ error: 'Your account is disabled. Contact Super Admin.' });
    }
    if (!resolved.user) {
      return res.status(401).json({ error: 'Account profile not found or inactive.' });
    }

    req.user = resolved.user;
    req.accessToken = token;
    return next();
  } catch (err) {
    console.error('requireAuth error:', err);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

export function requireRole(...roles: RoleSlug[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role_slug === 'super_admin' || roles.includes(req.user.role_slug)) {
      return next();
    }
    return res.status(403).json({ error: 'Access denied for your role' });
  };
}

export function requirePermission(code: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role_slug === 'super_admin' || req.user.permissions.includes(code)) {
      return next();
    }
    return res.status(403).json({ error: `Missing permission: ${code}` });
  };
}

export async function getTeacherIdForUser(user: AuthenticatedUser): Promise<string | null> {
  if (user.role_slug !== 'teacher' || !supabaseAdmin) return null;
  if (user.linked_type === 'teacher' && user.linked_id) return user.linked_id;
  const { data } = await supabaseAdmin
    .from('teachers')
    .select('id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  return data?.id ?? null;
}

export async function getParentIdForUser(user: AuthenticatedUser): Promise<string | null> {
  if (user.role_slug !== 'parent' || !supabaseAdmin) return null;
  if (user.linked_type === 'parent' && user.linked_id) return user.linked_id;
  const { data } = await supabaseAdmin
    .from('parents')
    .select('id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  return data?.id ?? null;
}

export async function getStudentIdForUser(user: AuthenticatedUser): Promise<string | null> {
  if (user.role_slug !== 'student' || !supabaseAdmin) return null;
  if (user.linked_type === 'student' && user.linked_id) return user.linked_id;
  const { data } = await supabaseAdmin
    .from('students')
    .select('id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  return data?.id ?? null;
}

export async function getTeacherAssignedClassIds(teacherId: string): Promise<string[]> {
  if (!supabaseAdmin) return [];
  const [taRes, clsRes, csRes] = await Promise.all([
    supabaseAdmin.from('teacher_assignments').select('class_id').eq('teacher_id', teacherId),
    supabaseAdmin.from('classes').select('id').eq('class_teacher_id', teacherId).is('deleted_at', null),
    supabaseAdmin.from('class_subjects').select('class_id').eq('teacher_id', teacherId),
  ]);
  const ids = new Set<string>();
  for (const r of taRes.data || []) if (r.class_id) ids.add(r.class_id);
  for (const r of clsRes.data || []) if (r.id) ids.add(r.id);
  for (const r of csRes.data || []) if (r.class_id) ids.add(r.class_id);
  return Array.from(ids);
}

export async function getParentStudentIds(parentId: string): Promise<string[]> {
  if (!supabaseAdmin) return [];
  const { data } = await supabaseAdmin.from('student_guardians').select('student_id').eq('parent_id', parentId);
  return (data || []).map((r) => r.student_id).filter(Boolean);
}

export async function canAccessStudent(user: AuthenticatedUser, studentId: string): Promise<boolean> {
  if (user.role_slug === 'super_admin' || user.role_slug === 'committee_member') return true;
  if (user.role_slug === 'student') {
    return (await getStudentIdForUser(user)) === studentId;
  }
  if (user.role_slug === 'parent') {
    const pid = await getParentIdForUser(user);
    if (!pid) return false;
    return (await getParentStudentIds(pid)).includes(studentId);
  }
  if (user.role_slug === 'teacher' && supabaseAdmin) {
    const tid = await getTeacherIdForUser(user);
    if (!tid) return false;
    const { data: student } = await supabaseAdmin
      .from('students')
      .select('class_id')
      .eq('id', studentId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!student?.class_id) return false;
    return (await getTeacherAssignedClassIds(tid)).includes(student.class_id);
  }
  return false;
}

export async function logActivity(
  user: { id?: string | null; username?: string; role_name?: string } | null,
  action: string,
  module: string,
  recordId: string = '',
  details = '',
  ipAddress = ''
) {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from('activity_logs').insert({
      user_id: user?.id || null,
      username: user?.username || 'system',
      role_name: user?.role_name || '',
      action,
      module,
      record_id: String(recordId),
      details,
      ip_address: ipAddress,
    });
  } catch (err) {
    console.error('Failed to write activity log:', err);
  }
}

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  linkModule = 'dashboard',
  referenceId: string | null = null
) {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      type,
      title,
      message,
      link_module: linkModule,
      reference_id: referenceId,
    });
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

export async function notifyRoles(
  roleSlugs: string[],
  type: string,
  title: string,
  message: string,
  linkModule = 'dashboard',
  referenceId: string | null = null
) {
  if (!supabaseAdmin || !roleSlugs.length) return;
  try {
    const { data: roleRows } = await supabaseAdmin.from('roles').select('id').in('slug', roleSlugs);
    const roleIds = (roleRows || []).map((r) => r.id);
    if (!roleIds.length) return;
    const { data: users } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .in('role_id', roleIds)
      .eq('status', 'active')
      .is('deleted_at', null);

    const rows = (users || []).map((u) => ({
      user_id: u.id,
      type,
      title,
      message,
      link_module: linkModule,
      reference_id: referenceId,
    }));
    if (rows.length) {
      await supabaseAdmin.from('notifications').insert(rows);
    }
  } catch (err) {
    console.error('Failed to notify roles:', err);
  }
}
