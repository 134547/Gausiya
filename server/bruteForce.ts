import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { supabaseAdmin, SUPABASE_SERVICE_ROLE_KEY } from './supabase.ts';
import { logActivity } from './auth.ts';

export const MAX_FAILED_ATTEMPTS = 5;
export const CAPTCHA_TRIGGER_ATTEMPTS = 3;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const TOO_MANY_ATTEMPTS_MESSAGE = 'Too many attempts. Please try again later.';

const AUTH_SECURITY_ENTITY_ID = '00000000-0000-0000-0000-000000000010';
const AUTH_SECURITY_FILE_TYPE = 'auth_security';
const IP_BURST_WINDOW_MS = 60 * 1000; // 1 minute
const IP_BURST_MAX_REQUESTS = 15; // max 15 requests per minute per IP on login/auth endpoints
const IP_FAIL_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_FAILURES_ACROSS_ACCOUNTS = 15; // prevents password spraying across many accounts from 1 IP
const CAPTCHA_TTL_MS = 5 * 60 * 1000;

const SECURITY_SECRET = crypto
  .createHash('sha256')
  .update(SUPABASE_SERVICE_ROLE_KEY || process.env.CAPTCHA_SECRET || 'madrasa-gausiya-razvia-auth-guard-v1')
  .digest();

interface AttemptState {
  attempts: number;
  firstFailedAt: number;
  lockedUntil: number;
  updatedAt: number;
}

interface BurstState {
  count: number;
  resetAt: number;
}

const attemptCache = new Map<string, AttemptState>();
const ipBurstCache = new Map<string, BurstState>();
const usedCaptchaNonces = new Map<string, number>();

export function getClientIp(req: Request): string {
  const vercelXff = req.headers['x-vercel-forwarded-for'];
  if (typeof vercelXff === 'string' && vercelXff.trim()) {
    return vercelXff.split(',')[0].trim();
  }
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return String(xff[0]).split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function hashBucketKey(raw: string): string {
  const digest = crypto.createHmac('sha256', SECURITY_SECRET).update(raw).digest('hex');
  return `BF_${digest.slice(0, 40)}`;
}

function makeBucketTitle(scope: string, identifier: string, ip: string): string {
  const normId = identifier.trim().toLowerCase();
  return hashBucketKey(`${scope}|${normId}|${ip}`);
}

function makeIpBucketTitle(scope: string, ip: string): string {
  return hashBucketKey(`${scope}|IP_ALL|${ip}`);
}

function cleanupMemoryCaches(now: number) {
  if (ipBurstCache.size > 2000) {
    for (const [k, v] of ipBurstCache) {
      if (v.resetAt <= now) ipBurstCache.delete(k);
    }
  }
  if (usedCaptchaNonces.size > 2000) {
    for (const [k, exp] of usedCaptchaNonces) {
      if (exp <= now) usedCaptchaNonces.delete(k);
    }
  }
  if (attemptCache.size > 2000) {
    for (const [k, v] of attemptCache) {
      if (v.lockedUntil <= now && now - v.updatedAt > ATTEMPT_WINDOW_MS) {
        attemptCache.delete(k);
      }
    }
  }
}

export function checkIpRateLimit(
  req: Request,
  res: Response,
  scope = 'auth',
  maxPerMinute = IP_BURST_MAX_REQUESTS
): boolean {
  const now = Date.now();
  cleanupMemoryCaches(now);
  const ip = getClientIp(req);
  const key = `${scope}|${ip}`;
  const current = ipBurstCache.get(key);

  if (!current || current.resetAt <= now) {
    ipBurstCache.set(key, { count: 1, resetAt: now + IP_BURST_WINDOW_MS });
    res.setHeader('X-RateLimit-Limit', String(maxPerMinute));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxPerMinute - 1)));
    return true;
  }

  current.count += 1;
  const remaining = Math.max(0, maxPerMinute - current.count);
  res.setHeader('X-RateLimit-Limit', String(maxPerMinute));
  res.setHeader('X-RateLimit-Remaining', String(remaining));

  if (current.count > maxPerMinute) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(429).json({
      error: TOO_MANY_ATTEMPTS_MESSAGE,
      code: 'RATE_LIMITED',
      retryAfterSeconds,
      lockedUntil: current.resetAt,
      attemptsRemaining: 0,
    });
    return false;
  }

  return true;
}

async function readAttemptState(bucketTitle: string): Promise<AttemptState | null> {
  const now = Date.now();
  const cached = attemptCache.get(bucketTitle);

  if (supabaseAdmin) {
    try {
      const { data } = await supabaseAdmin
        .from('documents')
        .select('file_url')
        .eq('entity_type', 'general')
        .eq('entity_id', AUTH_SECURITY_ENTITY_ID)
        .eq('file_type', AUTH_SECURITY_FILE_TYPE)
        .eq('title', bucketTitle)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.file_url) {
        const parsed = JSON.parse(data.file_url) as AttemptState;
        if (parsed && typeof parsed.attempts === 'number') {
          if (parsed.lockedUntil > 0 && now >= parsed.lockedUntil) {
            await deleteAttemptState(bucketTitle);
            return null;
          }
          if (parsed.lockedUntil === 0 && now - parsed.firstFailedAt > ATTEMPT_WINDOW_MS) {
            await deleteAttemptState(bucketTitle);
            return null;
          }
          attemptCache.set(bucketTitle, parsed);
          return parsed;
        }
      }
    } catch {
      // fall back to in-memory cache if DB read fails transiently
    }
  }

  if (cached) {
    if (cached.lockedUntil > 0 && now >= cached.lockedUntil) {
      attemptCache.delete(bucketTitle);
      return null;
    }
    if (cached.lockedUntil === 0 && now - cached.firstFailedAt > ATTEMPT_WINDOW_MS) {
      attemptCache.delete(bucketTitle);
      return null;
    }
    return cached;
  }

  return null;
}

async function writeAttemptState(bucketTitle: string, state: AttemptState): Promise<void> {
  attemptCache.set(bucketTitle, state);
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin
      .from('documents')
      .delete()
      .eq('entity_type', 'general')
      .eq('entity_id', AUTH_SECURITY_ENTITY_ID)
      .eq('file_type', AUTH_SECURITY_FILE_TYPE)
      .eq('title', bucketTitle);

    await supabaseAdmin.from('documents').insert({
      entity_type: 'general',
      entity_id: AUTH_SECURITY_ENTITY_ID,
      title: bucketTitle,
      file_url: JSON.stringify(state),
      file_type: AUTH_SECURITY_FILE_TYPE,
    });
  } catch {
    // keep in-memory protection active even if DB persistence fails
  }
}

async function deleteAttemptState(bucketTitle: string): Promise<void> {
  attemptCache.delete(bucketTitle);
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin
      .from('documents')
      .delete()
      .eq('entity_type', 'general')
      .eq('entity_id', AUTH_SECURITY_ENTITY_ID)
      .eq('file_type', AUTH_SECURITY_FILE_TYPE)
      .eq('title', bucketTitle);
  } catch {
    // ignore cleanup errors
  }
}

export interface CaptchaChallenge {
  token: string;
  image: string;
}

export function generateCaptchaChallenge(): CaptchaChallenge {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i += 1) {
    code += chars[crypto.randomInt(0, chars.length)];
  }

  const nonce = crypto.randomBytes(12).toString('hex');
  const exp = Date.now() + CAPTCHA_TTL_MS;
  const answerHash = crypto
    .createHmac('sha256', SECURITY_SECRET)
    .update(`${nonce}:${code}`)
    .digest('hex');

  const payloadB64 = Buffer.from(JSON.stringify({ n: nonce, h: answerHash, e: exp }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SECURITY_SECRET).update(payloadB64).digest('base64url');
  const token = `${payloadB64}.${sig}`;

  const colors = ['#DC1726', '#141E30', '#0F766E', '#991B1B', '#1E3A8A'];
  const lettersSvg = code
    .split('')
    .map((ch, idx) => {
      const x = 22 + idx * 32 + crypto.randomInt(-3, 4);
      const y = 34 + crypto.randomInt(-4, 5);
      const rot = crypto.randomInt(-16, 17);
      const color = colors[crypto.randomInt(0, colors.length)];
      return `<text x="${x}" y="${y}" fill="${color}" font-family="monospace, sans-serif" font-size="25" font-weight="800" transform="rotate(${rot} ${x} ${y})">${ch}</text>`;
    })
    .join('');

  const linesSvg = Array.from({ length: 4 })
    .map(() => {
      const x1 = crypto.randomInt(0, 40);
      const y1 = crypto.randomInt(6, 46);
      const x2 = crypto.randomInt(140, 180);
      const y2 = crypto.randomInt(6, 46);
      const c = colors[crypto.randomInt(0, colors.length)];
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="1.3" stroke-opacity="0.35" />`;
    })
    .join('');

  const dotsSvg = Array.from({ length: 18 })
    .map(() => {
      const cx = crypto.randomInt(6, 174);
      const cy = crypto.randomInt(6, 46);
      return `<circle cx="${cx}" cy="${cy}" r="1.2" fill="#737373" fill-opacity="0.35" />`;
    })
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="52" viewBox="0 0 180 52"><rect width="180" height="52" rx="8" fill="#F5F5F5" stroke="#E5E5E5"/>${linesSvg}${dotsSvg}${lettersSvg}</svg>`;
  const image = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

  return { token, image };
}

export function verifyCaptchaToken(token?: string, answer?: string): boolean {
  if (!token || !answer) return false;
  const parts = String(token).split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;

  const expectedSig = crypto.createHmac('sha256', SECURITY_SECRET).update(payloadB64).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }

  let parsed: { n?: string; h?: string; e?: number };
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return false;
  }

  const now = Date.now();
  if (!parsed.n || !parsed.h || !parsed.e || now > parsed.e) {
    return false;
  }
  if (usedCaptchaNonces.has(parsed.n)) {
    return false;
  }

  const cleanAnswer = String(answer).trim().toUpperCase().replace(/\s+/g, '');
  const candidateHash = crypto
    .createHmac('sha256', SECURITY_SECRET)
    .update(`${parsed.n}:${cleanAnswer}`)
    .digest('hex');

  const candBuf = Buffer.from(candidateHash, 'hex');
  const targetBuf = Buffer.from(parsed.h, 'hex');
  if (candBuf.length !== targetBuf.length || !crypto.timingSafeEqual(candBuf, targetBuf)) {
    return false;
  }

  usedCaptchaNonces.set(parsed.n, parsed.e);
  return true;
}

export interface LoginPrecheckResult {
  allowed: boolean;
  statusCode?: number;
  body?: Record<string, any>;
  retryAfterSeconds?: number;
}

export async function precheckLoginAttempt(
  req: Request,
  scope: 'portal_login' | 'result_login',
  identifier: string,
  captchaToken?: string,
  captchaAnswer?: string
): Promise<LoginPrecheckResult> {
  const now = Date.now();
  const ip = getClientIp(req);
  const bucketTitle = makeBucketTitle(scope, identifier, ip);
  const ipBucketTitle = makeIpBucketTitle(scope, ip);

  const [acctState, ipState] = await Promise.all([
    readAttemptState(bucketTitle),
    readAttemptState(ipBucketTitle),
  ]);

  // 1. IP-wide lockout check (prevents password spraying across accounts from same IP)
  if (ipState && ipState.lockedUntil > now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((ipState.lockedUntil - now) / 1000));
    return {
      allowed: false,
      statusCode: 429,
      retryAfterSeconds,
      body: {
        error: TOO_MANY_ATTEMPTS_MESSAGE,
        code: 'TOO_MANY_ATTEMPTS',
        lockedUntil: ipState.lockedUntil,
        retryAfterSeconds,
        attemptsRemaining: 0,
        captchaRequired: false,
      },
    };
  }

  // 2. Account + IP 5-attempt lockout check
  if (acctState && (acctState.lockedUntil > now || acctState.attempts >= MAX_FAILED_ATTEMPTS)) {
    const lockedUntil = acctState.lockedUntil > now ? acctState.lockedUntil : now + LOCKOUT_DURATION_MS;
    const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
    return {
      allowed: false,
      statusCode: 429,
      retryAfterSeconds,
      body: {
        error: TOO_MANY_ATTEMPTS_MESSAGE,
        code: 'TOO_MANY_ATTEMPTS',
        lockedUntil,
        retryAfterSeconds,
        attemptsRemaining: 0,
        captchaRequired: false,
      },
    };
  }

  // 3. CAPTCHA gate after repeated failed attempts (>= 3)
  const failedSoFar = Math.max(acctState?.attempts || 0, ipState?.attempts || 0);
  if (failedSoFar >= CAPTCHA_TRIGGER_ATTEMPTS) {
    if (!captchaToken || !captchaAnswer) {
      return {
        allowed: false,
        statusCode: 400,
        body: {
          error: 'Security verification required. Please solve the CAPTCHA code.',
          code: 'CAPTCHA_REQUIRED',
          captchaRequired: true,
          captcha: generateCaptchaChallenge(),
        },
      };
    }

    if (!verifyCaptchaToken(captchaToken, captchaAnswer)) {
      return {
        allowed: false,
        statusCode: 400,
        body: {
          error: 'Incorrect or expired CAPTCHA code. Please try again.',
          code: 'CAPTCHA_INVALID',
          captchaRequired: true,
          captcha: generateCaptchaChallenge(),
        },
      };
    }
  }

  return { allowed: true };
}

export async function recordFailedLoginAttempt(
  req: Request,
  scope: 'portal_login' | 'result_login',
  identifier: string
): Promise<{
  locked: boolean;
  lockedUntil?: number;
  retryAfterSeconds?: number;
  attemptsRemaining: number;
  captchaRequired: boolean;
  captcha?: CaptchaChallenge;
}> {
  const now = Date.now();
  const ip = getClientIp(req);
  const bucketTitle = makeBucketTitle(scope, identifier, ip);
  const ipBucketTitle = makeIpBucketTitle(scope, ip);

  const [prevAcct, prevIp] = await Promise.all([
    readAttemptState(bucketTitle),
    readAttemptState(ipBucketTitle),
  ]);

  const acctAttempts = (prevAcct && now - prevAcct.firstFailedAt <= ATTEMPT_WINDOW_MS ? prevAcct.attempts : 0) + 1;
  const acctFirst = prevAcct && now - prevAcct.firstFailedAt <= ATTEMPT_WINDOW_MS ? prevAcct.firstFailedAt : now;
  const acctLocked = acctAttempts >= MAX_FAILED_ATTEMPTS;
  const acctLockedUntil = acctLocked ? now + LOCKOUT_DURATION_MS : 0;

  const ipAttempts = (prevIp && now - prevIp.firstFailedAt <= IP_FAIL_WINDOW_MS ? prevIp.attempts : 0) + 1;
  const ipFirst = prevIp && now - prevIp.firstFailedAt <= IP_FAIL_WINDOW_MS ? prevIp.firstFailedAt : now;
  const ipLocked = ipAttempts >= IP_MAX_FAILURES_ACROSS_ACCOUNTS;
  const ipLockedUntil = ipLocked ? now + LOCKOUT_DURATION_MS : 0;

  await Promise.all([
    writeAttemptState(bucketTitle, {
      attempts: acctAttempts,
      firstFailedAt: acctFirst,
      lockedUntil: acctLockedUntil,
      updatedAt: now,
    }),
    writeAttemptState(ipBucketTitle, {
      attempts: ipAttempts,
      firstFailedAt: ipFirst,
      lockedUntil: ipLockedUntil,
      updatedAt: now,
    }),
  ]);

  const maskedId = identifier.trim().slice(0, 3) + '***';
  await logActivity(
    { id: null, username: maskedId, role_name: 'Security' },
    acctLocked || ipLocked ? 'LOGIN_LOCKED_BRUTE_FORCE' : 'LOGIN_FAILED_ATTEMPT',
    'auth',
    bucketTitle.slice(0, 16),
    acctLocked || ipLocked
      ? `Locked ${scope} for 15 minutes after ${acctAttempts} failed attempts`
      : `Failed ${scope} attempt ${acctAttempts}/${MAX_FAILED_ATTEMPTS}`,
    ip
  );

  if (acctLocked || ipLocked) {
    const lockedUntil = Math.max(acctLockedUntil, ipLockedUntil);
    const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
    return {
      locked: true,
      lockedUntil,
      retryAfterSeconds,
      attemptsRemaining: 0,
      captchaRequired: false,
    };
  }

  const attemptsRemaining = Math.max(0, MAX_FAILED_ATTEMPTS - acctAttempts);
  const captchaRequired = acctAttempts >= CAPTCHA_TRIGGER_ATTEMPTS;
  return {
    locked: false,
    attemptsRemaining,
    captchaRequired,
    captcha: captchaRequired ? generateCaptchaChallenge() : undefined,
  };
}

export async function clearFailedLoginAttempts(
  req: Request,
  scope: 'portal_login' | 'result_login',
  identifier: string
): Promise<void> {
  const ip = getClientIp(req);
  const bucketTitle = makeBucketTitle(scope, identifier, ip);
  await deleteAttemptState(bucketTitle);
}
