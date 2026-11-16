import { Router } from 'express';
import multer from 'multer';
import {
  createSupabaseAuthClient,
  isSupabaseServerConfigured,
  requireSupabaseAdmin,
  resolveStorageUrl,
  resolveStorageUrlsInRows,
  supabaseAdmin,
} from '../supabase.ts';
import { saveUploadedAsset } from '../imgbb.ts';
import { logActivity, notifyRoles } from '../auth.ts';

const router = Router();

const publicUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  },
});

export function normalizeStorageRef(url: string | null | undefined): string {
  if (!url) return '';
  const signMatch = url.match(/\/storage\/v1\/object\/sign\/([^/]+)\/([^?]+)/);
  if (signMatch) {
    return `supabase://${signMatch[1]}/${decodeURIComponent(signMatch[2])}`;
  }
  return url;
}

export function sanitizeOrTerm(val: string | null | undefined): string {
  return String(val || '')
    .replace(/[,()"'\\%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ADMISSION_SETTING_ENTITY_ID = '00000000-0000-0000-0000-000000000001';
const ADMISSION_SETTING_TITLE = 'ADMISSIONS_PORTAL_STATUS';

export async function getAdmissionsOpen(admin: NonNullable<typeof supabaseAdmin>): Promise<boolean> {
  const { data: colRow, error: colErr } = await admin
    .from('madrasa_settings')
    .select('admissions_open')
    .eq('id', 1)
    .maybeSingle();

  if (!colErr && typeof (colRow as any)?.admissions_open === 'boolean') {
    return (colRow as any).admissions_open;
  }

  const { data: docRow } = await admin
    .from('documents')
    .select('file_url')
    .eq('entity_type', 'general')
    .eq('entity_id', ADMISSION_SETTING_ENTITY_ID)
    .eq('title', ADMISSION_SETTING_TITLE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (docRow?.file_url === 'closed') return false;
  return true;
}

export async function setAdmissionsOpen(admin: NonNullable<typeof supabaseAdmin>, open: boolean): Promise<boolean> {
  const { error: colErr } = await admin
    .from('madrasa_settings')
    .update({ admissions_open: open })
    .eq('id', 1);

  if (!colErr) {
    return open;
  }

  await admin
    .from('documents')
    .delete()
    .eq('entity_type', 'general')
    .eq('entity_id', ADMISSION_SETTING_ENTITY_ID)
    .eq('title', ADMISSION_SETTING_TITLE);

  const { error: insErr } = await admin.from('documents').insert({
    entity_type: 'general',
    entity_id: ADMISSION_SETTING_ENTITY_ID,
    title: ADMISSION_SETTING_TITLE,
    file_url: open ? 'open' : 'closed',
    file_type: 'system_setting',
  });

  if (insErr) {
    throw new Error(insErr.message);
  }
  return open;
}

const RESULT_SETTING_ENTITY_ID = '00000000-0000-0000-0000-000000000002';
const RESULT_SETTING_TITLE = 'RESULTS_PORTAL_STATUS';

export async function getResultsOpen(admin: NonNullable<typeof supabaseAdmin>): Promise<boolean> {
  const { data: colRow, error: colErr } = await admin
    .from('madrasa_settings')
    .select('results_open')
    .eq('id', 1)
    .maybeSingle();

  if (!colErr && typeof (colRow as any)?.results_open === 'boolean') {
    return (colRow as any).results_open;
  }

  const { data: docRow } = await admin
    .from('documents')
    .select('file_url')
    .eq('entity_type', 'general')
    .eq('entity_id', RESULT_SETTING_ENTITY_ID)
    .eq('title', RESULT_SETTING_TITLE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (docRow?.file_url === 'closed') return false;
  return true;
}

export async function setResultsOpen(admin: NonNullable<typeof supabaseAdmin>, open: boolean): Promise<boolean> {
  const { error: colErr } = await admin
    .from('madrasa_settings')
    .update({ results_open: open })
    .eq('id', 1);

  if (!colErr) {
    return open;
  }

  await admin
    .from('documents')
    .delete()
    .eq('entity_type', 'general')
    .eq('entity_id', RESULT_SETTING_ENTITY_ID)
    .eq('title', RESULT_SETTING_TITLE);

  const { error: insErr } = await admin.from('documents').insert({
    entity_type: 'general',
    entity_id: RESULT_SETTING_ENTITY_ID,
    title: RESULT_SETTING_TITLE,
    file_url: open ? 'open' : 'closed',
    file_type: 'system_setting',
  });

  if (insErr) {
    throw new Error(insErr.message);
  }
  return open;
}

const CHAT_SETTING_ENTITY_ID = '00000000-0000-0000-0000-000000000003';
const CHAT_SETTING_TITLE = 'CHATS_PORTAL_STATUS';

export async function getChatsOpen(admin: NonNullable<typeof supabaseAdmin>): Promise<boolean> {
  const { data: colRow, error: colErr } = await admin
    .from('madrasa_settings')
    .select('chats_open')
    .eq('id', 1)
    .maybeSingle();

  if (!colErr && typeof (colRow as any)?.chats_open === 'boolean') {
    return (colRow as any).chats_open;
  }

  const { data: docRow } = await admin
    .from('documents')
    .select('file_url')
    .eq('entity_type', 'general')
    .eq('entity_id', CHAT_SETTING_ENTITY_ID)
    .eq('title', CHAT_SETTING_TITLE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (docRow?.file_url === 'closed') return false;
  return true;
}

export async function setChatsOpen(admin: NonNullable<typeof supabaseAdmin>, open: boolean): Promise<boolean> {
  const { error: colErr } = await admin
    .from('madrasa_settings')
    .update({ chats_open: open })
    .eq('id', 1);

  if (!colErr) {
    return open;
  }

  await admin
    .from('documents')
    .delete()
    .eq('entity_type', 'general')
    .eq('entity_id', CHAT_SETTING_ENTITY_ID)
    .eq('title', CHAT_SETTING_TITLE);

  const { error: insErr } = await admin.from('documents').insert({
    entity_type: 'general',
    entity_id: CHAT_SETTING_ENTITY_ID,
    title: CHAT_SETTING_TITLE,
    file_url: open ? 'open' : 'closed',
    file_type: 'system_setting',
  });

  if (insErr) {
    throw new Error(insErr.message);
  }
  return open;
}

router.get('/home', async (_req, res) => {
  try {
    if (!isSupabaseServerConfigured || !supabaseAdmin) {
      return res.json({
        supabaseConfigured: false,
        settings: null,
        classes: [],
        notices: [],
        exams: [],
        feedPosts: [],
        committee: [],
        publicResults: false,
      });
    }

    const [
      { data: settings },
      { data: classes },
      { data: notices },
      { data: examsRaw },
      { data: feedRaw },
      { data: committeeRaw },
      { count: publishedCount },
      admissionsOpenFlag,
      resultsOpenFlag,
    ] = await Promise.all([
      supabaseAdmin
        .from('madrasa_settings')
        .select('name, name_urdu, address, address_urdu, phone, email, website, logo_url')
        .eq('id', 1)
        .maybeSingle(),
      supabaseAdmin
        .from('classes')
        .select('id, name, code, room_no')
        .is('deleted_at', null)
        .eq('status', 'active')
        .order('code', { ascending: true }),
      supabaseAdmin
        .from('notices')
        .select('id, title, description, category, publish_date, attachment_url, attachment_name')
        .is('deleted_at', null)
        .eq('target_audience', 'all')
        .order('created_at', { ascending: false })
        .limit(6),
      supabaseAdmin
        .from('examinations')
        .select('id, name, exam_type, start_date, end_date, status, classes(name)')
        .is('deleted_at', null)
        .order('start_date', { ascending: false })
        .limit(6),
      supabaseAdmin
        .from('feed_posts')
        .select('id, title, content, images_json, likes_count, created_at, profiles(full_name, roles(name))')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(4),
      supabaseAdmin
        .from('committee_members')
        .select('id, full_name, designation, mobile, photo_url, description')
        .is('deleted_at', null)
        .eq('status', 'active')
        .order('display_order', { ascending: true }),
      supabaseAdmin
        .from('results')
        .select('id', { count: 'exact', head: true })
        .eq('is_published', true),
      getAdmissionsOpen(supabaseAdmin),
      getResultsOpen(supabaseAdmin),
    ]);

    if (settings?.logo_url) {
      settings.logo_url = await resolveStorageUrl(settings.logo_url);
    }

    const exams = (examsRaw || []).map((e: any) => ({
      id: e.id,
      name: e.name,
      exam_type: e.exam_type,
      start_date: e.start_date,
      end_date: e.end_date,
      status: e.status,
      class_name: e.classes?.name || '',
    }));

    const resolvedNotices = await resolveStorageUrlsInRows(notices || [], ['attachment_url']);

    const feedPosts = await Promise.all(
      (feedRaw || []).map(async (fp: any) => {
        let imgs: string[] = [];
        try {
          imgs = typeof fp.images_json === 'string' ? JSON.parse(fp.images_json || '[]') : Array.isArray(fp.images_json) ? fp.images_json : [];
        } catch {
          imgs = [];
        }
        const resolvedImgs = await Promise.all(imgs.map((u) => resolveStorageUrl(u)));
        return {
          id: fp.id,
          title: fp.title,
          content: fp.content,
          images_json: JSON.stringify(resolvedImgs),
          likes_count: fp.likes_count,
          created_at: fp.created_at,
          author_name: fp.profiles?.full_name || 'Administration',
          author_role: fp.profiles?.roles?.name || 'Admin',
        };
      })
    );

    const committee = await resolveStorageUrlsInRows(committeeRaw || [], ['photo_url']);

    return res.json({
      supabaseConfigured: true,
      settings: settings ? { ...settings, admissions_open: admissionsOpenFlag, results_open: resultsOpenFlag } : null,
      admissionsOpen: admissionsOpenFlag,
      resultsOpen: resultsOpenFlag,
      classes: classes || [],
      notices: resolvedNotices,
      exams,
      feedPosts,
      committee,
      publicResults: (publishedCount || 0) > 0,
    });
  } catch (err) {
    console.error('Public home error:', err);
    return res.status(500).json({ error: 'Failed to load public portal data' });
  }
});

router.post('/upload', publicUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const uploaded = await saveUploadedAsset({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      bucket: 'admission-documents',
      folder: 'public-applicants',
    });

    return res.json({
      url: uploaded.url,
      storedRef: uploaded.storedRef,
      provider: uploaded.provider,
      name: req.file.originalname,
    });
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 500;
    return res.status(status).json({ error: err?.message || 'Upload failed' });
  }
});

router.post('/admission', async (req, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;

    const admissionsOpen = await getAdmissionsOpen(admin);
    if (!admissionsOpen) {
      return res.status(403).json({
        error: 'Online admissions are currently closed by Madrasa administration.',
      });
    }

    const {
      student_name,
      father_name,
      mother_name,
      dob,
      gender,
      address,
      village,
      district,
      state,
      pin_code,
      student_mobile,
      guardian_name,
      guardian_relationship,
      guardian_mobile,
      previous_school,
      previous_class,
      admission_class_id,
      photo_url,
      remarks,
    } = req.body as Record<string, any>;

    if (!student_name?.trim() || !father_name?.trim() || !guardian_mobile?.trim()) {
      return res.status(400).json({ error: 'Student name, father name, and guardian mobile number are required.' });
    }

    const { count } = await admin.from('admissions').select('id', { count: 'exact', head: true });
    let seq = 1000 + (count || 0) + 1;
    let referenceNo = `REF-${new Date().getFullYear()}-${seq}`;
    const { data: dupCheck } = await admin
      .from('admissions')
      .select('id')
      .eq('admission_no', referenceNo)
      .maybeSingle();
    if (dupCheck) {
      referenceNo = `REF-${new Date().getFullYear()}-${seq}${String(Date.now()).slice(-3)}`;
    }
    const today = new Date().toISOString().slice(0, 10);

    const { data: inserted, error } = await admin
      .from('admissions')
      .insert({
        admission_no: referenceNo,
        student_name: student_name.trim(),
        father_name: father_name.trim(),
        mother_name: mother_name || '',
        dob: dob || '',
        gender: gender || 'Male',
        religion: 'Islam',
        address: address || '',
        village: village || '',
        district: district || 'Palamu',
        state: state || 'Jharkhand',
        pin_code: pin_code || '',
        student_mobile: student_mobile || guardian_mobile.trim(),
        guardian_name: (guardian_name || father_name).trim(),
        guardian_relationship: guardian_relationship || 'Father',
        guardian_mobile: guardian_mobile.trim(),
        previous_school: previous_school || '',
        previous_class: previous_class || '',
        admission_date: today,
        admission_class_id: admission_class_id || null,
        photo_url: normalizeStorageRef(photo_url),
        remarks: remarks || 'Submitted via Online Home Page',
        status: 'pending',
      })
      .select('id')
      .single();

    if (error || !inserted) {
      return res.status(400).json({ error: error?.message || 'Failed to submit admission application' });
    }

    let className = 'To be assigned';
    if (admission_class_id) {
      const { data: cls } = await admin.from('classes').select('name').eq('id', admission_class_id).maybeSingle();
      if (cls?.name) className = cls.name;
    }

    await notifyRoles(
      ['super_admin'],
      'admission',
      'New Online Admission Application',
      `${student_name.trim()} (Ref: ${referenceNo}) applied online${className !== 'To be assigned' ? ` for ${className}` : ''}.`,
      'admissions',
      inserted.id
    );
    await logActivity(
      { id: null, username: 'public_applicant', role_name: 'Public' },
      'PUBLIC_ADMISSION_SUBMITTED',
      'admissions',
      inserted.id,
      `Online admission reference ${referenceNo} for ${student_name.trim()}`,
      req.ip
    );

    const resolvedPhotoUrl = photo_url ? await resolveStorageUrl(normalizeStorageRef(photo_url)) : '';

    return res.status(201).json({
      id: inserted.id,
      reference_no: referenceNo,
      admission_no: referenceNo,
      student_name: student_name.trim(),
      father_name: father_name.trim(),
      mother_name: mother_name || '',
      dob: dob || '',
      gender: gender || 'Male',
      religion: 'Islam',
      address: address || '',
      village: village || '',
      district: district || 'Palamu',
      state: state || 'Jharkhand',
      pin_code: pin_code || '',
      student_mobile: student_mobile || guardian_mobile.trim(),
      guardian_name: (guardian_name || father_name).trim(),
      guardian_relationship: guardian_relationship || 'Father',
      guardian_mobile: guardian_mobile.trim(),
      previous_school: previous_school || '',
      previous_class: previous_class || '',
      class_name: className,
      admission_date: today,
      photo_url: resolvedPhotoUrl,
      remarks: remarks || 'Submitted via Online Home Page',
      status: 'pending',
    });
  } catch (err: any) {
    console.error('Public admission error:', err);
    return res.status(400).json({ error: err?.message || 'Failed to submit admission application' });
  }
});

router.post('/check-result', async (req, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    if (!(await getResultsOpen(admin))) {
      return res.status(403).json({
        error: 'Online result checking is currently turned off by Madrasa administration.',
      });
    }
    const authClient = createSupabaseAuthClient();
    if (!authClient) return res.status(503).json({ error: 'Supabase auth client unavailable' });

    const { username, password } = req.body as { username?: string; password?: string };
    if (!username?.trim() || !password) {
      return res.status(400).json({ error: 'Student username (or ID/email) and password are required.' });
    }

    const clean = username.trim();
    let profileRow: { id: string; email: string; linked_type: string | null; linked_id: string | null } | null = null;

    if (clean.includes('@')) {
      const { data } = await admin
        .from('profiles')
        .select('id, email, linked_type, linked_id')
        .eq('email', clean)
        .is('deleted_at', null)
        .maybeSingle();
      profileRow = data;
    } else {
      const safeClean = sanitizeOrTerm(clean);
      if (safeClean) {
        const { data } = await admin
          .from('profiles')
          .select('id, email, linked_type, linked_id')
          .or(`username.eq.${safeClean},user_code.eq.${safeClean}`)
          .is('deleted_at', null)
          .maybeSingle();
        profileRow = data;
      }

      if (!profileRow) {
        const { data: stByCode } = await admin
          .from('students')
          .select('id, user_id')
          .eq('student_code', clean)
          .is('deleted_at', null)
          .maybeSingle();
        if (stByCode?.user_id) {
          const { data: p } = await admin
            .from('profiles')
            .select('id, email, linked_type, linked_id')
            .eq('id', stByCode.user_id)
            .is('deleted_at', null)
            .maybeSingle();
          profileRow = p;
        }
      }
    }

    if (!profileRow?.email) {
      return res.status(401).json({ error: 'Invalid student username or password.' });
    }

    // Verify password strictly via Supabase Auth
    const { error: signInErr } = await authClient.auth.signInWithPassword({
      email: profileRow.email,
      password,
    });
    if (signInErr) {
      return res.status(401).json({ error: 'Invalid student username or password.' });
    }

    let studentId: string | null = profileRow.linked_type === 'student' ? profileRow.linked_id : null;
    if (!studentId) {
      const { data: st } = await admin
        .from('students')
        .select('id')
        .eq('user_id', profileRow.id)
        .is('deleted_at', null)
        .maybeSingle();
      studentId = st?.id || null;
    }

    if (!studentId) {
      return res.status(404).json({ error: 'No student academic record linked to this account.' });
    }

    const { data: studentRaw } = await admin
      .from('students')
      .select('*, classes(name)')
      .eq('id', studentId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!studentRaw) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    const student = {
      ...studentRaw,
      photo_url: await resolveStorageUrl(studentRaw.photo_url),
      class_name: (studentRaw as any).classes?.name || 'Unassigned',
    };

    const { data: resultsRaw } = await admin
      .from('results')
      .select('*, examinations!inner(name, exam_type, start_date, deleted_at)')
      .eq('student_id', studentId)
      .eq('is_published', true)
      .is('examinations.deleted_at', null)
      .order('created_at', { ascending: false });

    const { data: marksRaw } = await admin
      .from('marks')
      .select('*, subjects(name, passing_marks)')
      .eq('student_id', studentId);

    const results = (resultsRaw || []).map((r: any) => ({
      ...r,
      exam_name: r.examinations?.name || '',
      exam_type: r.examinations?.exam_type || '',
      start_date: r.examinations?.start_date || '',
      subject_marks: (marksRaw || [])
        .filter((m: any) => m.examination_id === r.examination_id)
        .map((m: any) => ({
          ...m,
          subject_name: m.subjects?.name || '',
          passing_marks: m.subjects?.passing_marks ?? 33,
        }))
        .sort((a: any, b: any) => a.subject_name.localeCompare(b.subject_name)),
    }));

    const { data: attRows } = await admin
      .from('attendance')
      .select('status')
      .eq('student_id', studentId);

    const attendanceSummary = {
      total: (attRows || []).length,
      present: (attRows || []).filter((a) => a.status === 'present').length,
      absent: (attRows || []).filter((a) => a.status === 'absent').length,
      late: (attRows || []).filter((a) => a.status === 'late').length,
      on_leave: (attRows || []).filter((a) => a.status === 'leave').length,
    };

    return res.json({ student, results, attendanceSummary });
  } catch (err) {
    console.error('Public result check error:', err);
    return res.status(500).json({ error: 'Failed to retrieve result' });
  }
});

router.get('/image-data', async (req, res) => {
  try {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) return res.status(400).json({ error: 'Missing url parameter' });

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return res.status(400).json({ error: 'Unsupported protocol' });
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      host.endsWith('.local') ||
      host === '::1' ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return res.status(403).json({ error: 'Blocked host' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(parsed.toString(), { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) {
      return res.status(404).json({ error: 'Image unavailable' });
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ error: 'Not an image resource' });
    }
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image too large' });
    }
    const dataUrl = `data:${contentType.split(';')[0]};base64,${buf.toString('base64')}`;
    return res.json({ dataUrl });
  } catch {
    return res.status(500).json({ error: 'Failed to load image' });
  }
});

export default router;
