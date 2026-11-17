import { Router } from 'express';
import {
  createSupabaseAuthClient,
  isSupabaseServerConfigured,
  requireSupabaseAdmin,
  resolveStorageUrl,
} from '../supabase.ts';
import {
  AuthRequest,
  getUserWithPermissions,
  logActivity,
  notifyRoles,
  requireAuth,
} from '../auth.ts';
import { getAdmissionsOpen, getChatsOpen, getResultsOpen, normalizeStorageRef, sanitizeOrTerm } from './publicRoutes.ts';
import {
  TOO_MANY_ATTEMPTS_MESSAGE,
  checkIpRateLimit,
  clearFailedLoginAttempts,
  generateCaptchaChallenge,
  precheckLoginAttempt,
  recordFailedLoginAttempt,
} from '../bruteForce.ts';
import {
  STUDENT_PENDING_LOGIN_MESSAGE,
  STUDENT_REJECTED_LOGIN_MESSAGE,
} from '../studentProvisioning.ts';

const router = Router();

router.get('/captcha', (req, res) => {
  if (!checkIpRateLimit(req, res, 'captcha', 30)) return;
  return res.json(generateCaptchaChallenge());
});

async function ensurePublicRole(admin: NonNullable<ReturnType<typeof requireSupabaseAdmin>>) {
  const { data: existing } = await admin.from('roles').select('id, name, slug').eq('slug', 'public').maybeSingle();
  if (existing?.id) return { role: existing, error: null as string | null };
  const { data: inserted, error } = await admin
    .from('roles')
    .upsert(
      {
        name: 'Public',
        slug: 'public',
        description: 'Public account access to feed, notices, programs, committee, and contact information',
      },
      { onConflict: 'slug' }
    )
    .select('id, name, slug')
    .single();
  return { role: inserted || null, error: error?.message || null };
}

async function hasActiveSuperAdmin(admin: NonNullable<ReturnType<typeof requireSupabaseAdmin>>): Promise<boolean> {
  const { data: role } = await admin.from('roles').select('id').eq('slug', 'super_admin').maybeSingle();
  if (!role?.id) return false;
  const { count } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', role.id)
    .eq('status', 'active')
    .is('deleted_at', null);
  return (count || 0) > 0;
}

router.get('/setup-status', async (_req, res) => {
  try {
    if (!isSupabaseServerConfigured) {
      return res.json({ needsSetup: false, supabaseConfigured: false });
    }
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const exists = await hasActiveSuperAdmin(admin);
    return res.json({ needsSetup: !exists, supabaseConfigured: true });
  } catch {
    return res.json({ needsSetup: false, supabaseConfigured: isSupabaseServerConfigured });
  }
});

router.post('/setup-admin', async (req, res) => {
  try {
    if (!checkIpRateLimit(req, res, 'setup_admin', 10)) return;
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const authClient = createSupabaseAuthClient();
    if (!authClient) {
      return res.status(503).json({ error: 'Supabase anon key is not configured on the server.' });
    }

    if (await hasActiveSuperAdmin(admin)) {
      return res.status(403).json({ error: 'Super Admin account already exists. Please sign in.' });
    }

    const { full_name, username, email, password } = req.body as {
      full_name?: string;
      username?: string;
      email?: string;
      password?: string;
    };

    const cleanName = (full_name || 'Super Admin').trim();
    const cleanUsername = (username || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanUsername || !cleanEmail.includes('@') || !password || password.length < 6) {
      return res.status(400).json({
        error: 'Valid username, email address, and password (min 6 chars) are required.',
      });
    }

    const { data: role } = await admin.from('roles').select('id').eq('slug', 'super_admin').maybeSingle();
    if (!role?.id) {
      return res.status(400).json({ error: 'Super Admin role not found in database. Please run seed.sql first.' });
    }

    let userId: string | null = null;
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existingProfile?.id) {
      const existingId = String(existingProfile.id);
      userId = existingId;
      const { error: updErr } = await admin.auth.admin.updateUserById(existingId, {
        password,
        email_confirm: true,
        user_metadata: { full_name: cleanName },
      });
      if (updErr) return res.status(400).json({ error: updErr.message });
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: cleanName },
      });
      if (createErr && createErr.message.toLowerCase().includes('already')) {
        const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const found = listed?.users?.find((u) => (u.email || '').toLowerCase() === cleanEmail);
        if (!found) return res.status(400).json({ error: createErr.message });
        userId = found.id;
        const { error: updErr } = await admin.auth.admin.updateUserById(found.id, {
          password,
          email_confirm: true,
          user_metadata: { full_name: cleanName },
        });
        if (updErr) return res.status(400).json({ error: updErr.message });
      } else if (createErr || !created.user) {
        return res.status(400).json({ error: createErr?.message || 'Failed to create Super Admin auth account.' });
      } else {
        userId = created.user.id;
      }
    }

    if (!userId) {
      return res.status(500).json({ error: 'Unable to resolve Super Admin user ID.' });
    }

    const userCode = `ADM-${cleanUsername.slice(0, 4).toUpperCase() || '001'}`;
    const { error: profErr } = await admin.from('profiles').upsert(
      {
        id: userId,
        user_code: userCode,
        username: cleanUsername,
        email: cleanEmail,
        full_name: cleanName,
        role_id: role.id,
        status: 'active',
        linked_type: 'admin',
        deleted_at: null,
      },
      { onConflict: 'id' }
    );
    if (profErr) return res.status(400).json({ error: profErr.message });

    const { data: signInData, error: signInErr } = await authClient.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (signInErr || !signInData.session || !signInData.user) {
      return res.status(400).json({ error: signInErr?.message || 'Account created, please sign in.' });
    }

    const resolved = await getUserWithPermissions(signInData.user.id);
    if (!resolved.user) {
      return res.status(500).json({ error: 'Account created, but failed to load profile.' });
    }

    await logActivity(
      { id: resolved.user.id, username: resolved.user.username, role_name: resolved.user.role_name },
      'SUPER_ADMIN_SETUP',
      'auth',
      resolved.user.id,
      'Initial Super Admin account configured',
      req.ip
    );

    return res.status(201).json({
      token: signInData.session.access_token,
      session: signInData.session,
      user: resolved.user,
    });
  } catch (err: any) {
    console.error('Setup admin error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to set up Super Admin' });
  }
});

// Public Self-Registration (defaults safely to 'public' role; Super Admin can view & change role anytime)
router.post('/register', async (req, res) => {
  try {
    if (!checkIpRateLimit(req, res, 'register', 10)) return;
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const authClient = createSupabaseAuthClient();
    if (!authClient) {
      return res.status(503).json({ error: 'Supabase anon key is not configured on the server.' });
    }

    const { full_name, username, email, mobile, password, father_name, village, district } = req.body as {
      full_name?: string;
      username?: string;
      email?: string;
      mobile?: string;
      password?: string;
      father_name?: string;
      village?: string;
      district?: string;
    };

    const cleanName = (full_name || '').trim();
    const cleanUsername = (username || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanMobile = (mobile || '').trim();

    if (!cleanName || !cleanUsername || !cleanEmail.includes('@') || !password || password.length < 6) {
      return res.status(400).json({
        error: 'Full name, valid username, email address, and password (min 6 chars) are required.',
      });
    }

    const { data: existingUsername } = await admin
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .is('deleted_at', null)
      .maybeSingle();
    if (existingUsername) {
      return res.status(409).json({ error: 'Username is already taken. Please choose another.' });
    }

    const { data: existingEmail } = await admin
      .from('profiles')
      .select('id')
      .eq('email', cleanEmail)
      .is('deleted_at', null)
      .maybeSingle();
    if (existingEmail) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const { role: publicRole, error: roleErr } = await ensurePublicRole(admin);
    if (!publicRole?.id) {
      const hint =
        roleErr && roleErr.includes('roles_slug_check')
          ? 'Please run supabase/migrations/2026_add_public_role.sql in your Supabase SQL Editor to enable the public role.'
          : roleErr || 'Public role could not be initialized.';
      return res.status(500).json({ error: hint });
    }

    const { data: createdAuth, error: createErr } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: cleanName, username: cleanUsername },
    });
    if (createErr || !createdAuth.user) {
      return res.status(400).json({ error: createErr?.message || 'Failed to create account.' });
    }

    const uid = createdAuth.user.id;
    const userCode = `PUB-${String(Date.now()).slice(-6)}`;
    const { error: profErr } = await admin.from('profiles').upsert(
      {
        id: uid,
        user_code: userCode,
        username: cleanUsername,
        email: cleanEmail,
        mobile: cleanMobile,
        full_name: cleanName,
        father_name: (father_name || '').trim(),
        village: (village || '').trim(),
        district: (district || 'Palamu').trim(),
        state: 'Jharkhand',
        role_id: publicRole.id,
        status: 'active',
        linked_type: 'public',
        deleted_at: null,
      },
      { onConflict: 'id' }
    );
    if (profErr) {
      await admin.auth.admin.deleteUser(uid).catch(() => {});
      return res.status(400).json({ error: profErr.message });
    }

    const { data: signInData, error: signInErr } = await authClient.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (signInErr || !signInData.session || !signInData.user) {
      return res.status(400).json({ error: signInErr?.message || 'Account created, please sign in.' });
    }

    const resolved = await getUserWithPermissions(signInData.user.id);
    if (!resolved.user) {
      return res.status(500).json({ error: 'Account created, but failed to load profile.' });
    }

    await notifyRoles(
      ['super_admin'],
      'ACCOUNT_CREATED',
      'New Account Registered',
      `${cleanName} (@${cleanUsername}) created a new portal account (Role: Public).`,
      'super_admin',
      uid
    );
    await logActivity(
      { id: resolved.user.id, username: resolved.user.username, role_name: resolved.user.role_name },
      'USER_REGISTERED',
      'auth',
      uid,
      `Self-registered account @${cleanUsername} (${cleanEmail})`,
      req.ip
    );

    return res.status(201).json({
      token: signInData.session.access_token,
      session: signInData.session,
      user: resolved.user,
    });
  } catch (err: any) {
    console.error('Register error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to create account' });
  }
});

// Email OR Username/Mobile/UserCode login backed exclusively by Supabase Auth (auth.users)
router.post('/login', async (req, res) => {
  try {
    if (!checkIpRateLimit(req, res, 'portal_login', 15)) return;

    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const authClient = createSupabaseAuthClient();
    if (!authClient) {
      return res.status(503).json({ error: 'Supabase anon key is not configured on the server.' });
    }

    const { identifier, password, captchaToken, captchaAnswer } = req.body as {
      identifier?: string;
      password?: string;
      captchaToken?: string;
      captchaAnswer?: string;
    };
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email/username and password are required.' });
    }

    const cleanId = identifier.trim();
    const precheck = await precheckLoginAttempt(req, 'portal_login', cleanId, captchaToken, captchaAnswer);
    if (!precheck.allowed) {
      if (precheck.retryAfterSeconds) {
        res.setHeader('Retry-After', String(precheck.retryAfterSeconds));
      }
      return res.status(precheck.statusCode || 429).json(precheck.body);
    }

    const handleFailure = async (fallbackMessage: string) => {
      const fail = await recordFailedLoginAttempt(req, 'portal_login', cleanId);
      if (fail.locked) {
        if (fail.retryAfterSeconds) {
          res.setHeader('Retry-After', String(fail.retryAfterSeconds));
        }
        return res.status(429).json({
          error: TOO_MANY_ATTEMPTS_MESSAGE,
          code: 'TOO_MANY_ATTEMPTS',
          lockedUntil: fail.lockedUntil,
          retryAfterSeconds: fail.retryAfterSeconds,
          attemptsRemaining: 0,
          captchaRequired: false,
        });
      }
      return res.status(401).json({
        error: fallbackMessage,
        code: 'INVALID_CREDENTIALS',
        captchaRequired: fail.captchaRequired,
        captcha: fail.captcha,
      });
    };

    let emailToLogin = cleanId;

    if (!cleanId.includes('@')) {
      const safeId = sanitizeOrTerm(cleanId);
      if (!safeId) {
        return handleFailure('Invalid credentials. Please check username and password.');
      }
      const { data: profileMatch } = await admin
        .from('profiles')
        .select('email, status')
        .or(`username.eq.${safeId},username.eq.${safeId.toLowerCase()},mobile.eq.${safeId},user_code.eq.${safeId.toUpperCase()}`)
        .is('deleted_at', null)
        .maybeSingle();

      if (!profileMatch?.email) {
        return handleFailure('Invalid credentials. Please check username and password.');
      }
      emailToLogin = profileMatch.email;
    }

    const { data: signInData, error: signInErr } = await authClient.auth.signInWithPassword({
      email: emailToLogin,
      password,
    });

    if (signInErr || !signInData.session || !signInData.user) {
      return handleFailure('Invalid credentials. Please check email/username and password.');
    }

    await clearFailedLoginAttempts(req, 'portal_login', cleanId);

    const resolved = await getUserWithPermissions(signInData.user.id);
    if (resolved.pendingStudent) {
      return res.status(403).json({
        error: STUDENT_PENDING_LOGIN_MESSAGE,
        code: 'ADMISSION_PENDING',
      });
    }
    if (resolved.pending) {
      return res.status(403).json({
        error: 'Your account is pending Super Admin approval and role assignment.',
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
      return res.status(403).json({ error: 'Your account is currently disabled. Contact Super Admin.' });
    }
    if (!resolved.user) {
      return res.status(403).json({ error: 'User profile is not active or not configured.' });
    }

    await admin
      .from('profiles')
      .update({ last_login: new Date().toISOString() })
      .eq('id', signInData.user.id);

    await logActivity(
      { id: resolved.user.id, username: resolved.user.username, role_name: resolved.user.role_name },
      'USER_LOGIN',
      'auth',
      resolved.user.id,
      'Signed in via Supabase Auth',
      req.ip
    );

    res.clearCookie('sb_access_token');
    return res.json({
      token: signInData.session.access_token,
      session: signInData.session,
      user: resolved.user,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Failed to process login' });
  }
});

router.post('/logout', requireAuth, async (req: AuthRequest, res) => {
  try {
    await logActivity(req.user!, 'USER_LOGOUT', 'auth', req.user!.id, 'User logged out', req.ip);
    res.clearCookie('sb_access_token');
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to logout' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const authClient = createSupabaseAuthClient();
    if (!authClient) {
      return res.status(503).json({ error: 'Supabase auth client unavailable' });
    }
    const refreshToken = String((req.body as { refresh_token?: string })?.refresh_token || '').trim();
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required', code: 'SESSION_EXPIRED' });
    }

    const { data, error } = await authClient.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data?.session?.access_token || !data?.user) {
      res.clearCookie('sb_access_token');
      return res.status(401).json({ error: 'Your session has expired. Please sign in again.', code: 'SESSION_EXPIRED' });
    }

    const resolved = await getUserWithPermissions(data.user.id);
    if (!resolved.user) {
      res.clearCookie('sb_access_token');
      return res.status(403).json({
        error: resolved.pendingStudent
          ? STUDENT_PENDING_LOGIN_MESSAGE
          : resolved.rejected
            ? STUDENT_REJECTED_LOGIN_MESSAGE
            : 'Account is inactive or pending approval.',
        code: 'SESSION_EXPIRED',
      });
    }

    res.clearCookie('sb_access_token');
    return res.json({
      token: data.session.access_token,
      session: data.session,
      user: resolved.user,
    });
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.', code: 'SESSION_EXPIRED' });
  }
});

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;

    const [{ data: settings }, { data: profile }, admissionsOpen, resultsOpen, chatsOpen] = await Promise.all([
      admin.from('madrasa_settings').select('*').eq('id', 1).maybeSingle(),
      admin.from('profiles').select('*').eq('id', req.user!.id).maybeSingle(),
      getAdmissionsOpen(admin),
      getResultsOpen(admin),
      getChatsOpen(admin),
    ]);

    if (settings) {
      if (settings.logo_url) {
        settings.logo_url = await resolveStorageUrl(settings.logo_url);
      }
      if (typeof settings.grading_rules_json !== 'string') {
        settings.grading_rules_json = JSON.stringify(settings.grading_rules_json || []);
      }
      settings.admissions_open = admissionsOpen;
      settings.results_open = resultsOpen;
      settings.chats_open = chatsOpen;
    }
    if (profile?.photo_url) {
      profile.photo_url = await resolveStorageUrl(profile.photo_url);
    }

    return res.json({ user: req.user, profile, settings });
  } catch (err) {
    console.error('GET /me error:', err);
    return res.status(500).json({ error: 'Failed to load user profile' });
  }
});

router.put('/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;

    const {
      full_name,
      email,
      mobile,
      father_name,
      dob,
      gender,
      address,
      village,
      district,
      state,
      pin_code,
      photo_url,
      bio,
    } = req.body;

    // Only allow updating safe personal fields; NEVER role_id, status, or linked_id
    const updatePayload: Record<string, any> = {
      full_name: full_name || req.user!.full_name,
      mobile: mobile ?? req.user!.mobile,
      father_name: father_name ?? '',
      dob: dob ?? '',
      gender: gender ?? 'Male',
      address: address ?? '',
      village: village ?? '',
      district: district ?? 'Palamu',
      state: state ?? 'Jharkhand',
      pin_code: pin_code ?? '',
      bio: bio ?? '',
    };
    if (typeof photo_url === 'string') {
      updatePayload.photo_url = normalizeStorageRef(photo_url);
    }
    if (email && email !== req.user!.email) {
      const { error: authEmailErr } = await admin.auth.admin.updateUserById(req.user!.id, { email });
      if (authEmailErr) return res.status(400).json({ error: authEmailErr.message });
      updatePayload.email = email;
    }

    const { error } = await admin.from('profiles').update(updatePayload).eq('id', req.user!.id);
    if (error) return res.status(400).json({ error: error.message });

    await logActivity(req.user!, 'PROFILE_UPDATED', 'auth', req.user!.id, 'Updated personal profile', req.ip);
    const resolved = await getUserWithPermissions(req.user!.id);
    const { data: profile } = await admin.from('profiles').select('*').eq('id', req.user!.id).maybeSingle();
    if (profile?.photo_url) profile.photo_url = await resolveStorageUrl(profile.photo_url);

    return res.json({ user: resolved.user, profile });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.post('/change-password', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = requireSupabaseAdmin(res);
    if (!admin) return;
    const authClient = createSupabaseAuthClient();
    if (!authClient) return res.status(503).json({ error: 'Supabase auth client unavailable' });

    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Current password and a new password (min 6 chars) are required.' });
    }

    // Verify current password against Supabase Auth
    const { error: verifyErr } = await authClient.auth.signInWithPassword({
      email: req.user!.email,
      password: currentPassword,
    });
    if (verifyErr) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(req.user!.id, {
      password: newPassword,
    });
    if (updErr) return res.status(400).json({ error: updErr.message });

    await logActivity(req.user!, 'PASSWORD_CHANGED', 'auth', req.user!.id, 'User changed account password', req.ip);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
