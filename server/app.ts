import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { isSupabaseServerConfigured, supabaseAdmin } from './supabase.ts';
import { isImgbbConfigured } from './imgbb.ts';
import {
  ensureAllTursoSchemas,
  getTursoMediaMeta,
  isTursoConfigured,
  readTursoMediaByteRange,
  verifyTursoMediaToken,
} from './turso.ts';
import authRoutes from './routes/authRoutes.ts';
import dashboardRoutes from './routes/dashboardRoutes.ts';
import coreRoutes from './routes/coreRoutes.ts';
import academicRoutes from './routes/academicRoutes.ts';
import communityRoutes from './routes/communityRoutes.ts';
import publicRoutes from './routes/publicRoutes.ts';
import reportRoutes from './routes/reportRoutes.ts';
import scheduleRoutes from './routes/scheduleRoutes.ts';

async function syncDefaultAddressIfLegacy() {
  if (!supabaseAdmin) return;
  try {
    const { data: row } = await supabaseAdmin
      .from('madrasa_settings')
      .select('id, address, address_urdu')
      .eq('id', 1)
      .maybeSingle();
    if (!row) return;
    const legacyAddresses = new Set([
      'Islamnagar, Ramgarh, Jharkhand, India - 829122',
      'Islamnagar, Ramgarh, (P.S.) Ramgarh, (P.O.) Ramgarh, Jharkhand, India',
    ]);
    const patch: Record<string, string> = {};
    if (legacyAddresses.has((row.address || '').trim())) {
      patch.address = 'Islamnagar, Ramgarh, (P.S.) Ramgarh, (P.O.) Ramgarh, Palamu, Jharkhand, India, 822110';
    }
    if ((row.address_urdu || '').trim() === 'اسلام نگر، رام گڑھ، جھارکھنڈ، انڈیا') {
      patch.address_urdu = 'اسلام نگر، رام گڑھ، پلاموں، جھارکھنڈ، انڈیا';
    }
    if (Object.keys(patch).length > 0) {
      await supabaseAdmin.from('madrasa_settings').update(patch).eq('id', 1);
    }
  } catch {
    // ignore startup sync error
  }
}

async function ensureCoreRolesExist() {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin
      .from('roles')
      .upsert(
        [
          {
            name: 'Public',
            slug: 'public',
            description: 'Public account access to feed, notices, programs, committee, and contact information',
          },
          {
            name: 'Parent',
            slug: 'parent',
            description: 'Access to linked children profiles, attendance, results, homework, syllabus, and notices',
          },
        ],
        { onConflict: 'slug' }
      );
    if (error) {
      console.warn('Core roles sync skipped:', error.message);
    }
  } catch {
    // ignore startup sync error
  }
}

let startupSyncPromise: Promise<void> | null = null;

function ensureStartupSync() {
  if (!startupSyncPromise) {
    startupSyncPromise = Promise.all([
      syncDefaultAddressIfLegacy(),
      ensureCoreRolesExist(),
      ensureAllTursoSchemas().catch((err) => {
        console.warn('Turso auto-schema sync skipped:', err?.message || err);
      }),
    ]).then(() => {});
  }
  return startupSyncPromise;
}

function wrapAsyncHandler(fn: any) {
  if (typeof fn !== 'function' || fn.length === 4 || (fn as any).__asyncWrapped) {
    return fn;
  }
  const wrapped = function (this: any, req: any, res: any, next: any) {
    try {
      const result = fn.call(this, req, res, next);
      if (result && typeof result.then === 'function') {
        result.catch((err: any) => {
          if (res.headersSent) return;
          next(err);
        });
      }
      return result;
    } catch (err) {
      if (res.headersSent) return;
      return next(err);
    }
  };
  (wrapped as any).__asyncWrapped = true;
  return wrapped;
}

function patchRouterStackAsync(stack: any[]) {
  if (!Array.isArray(stack)) return;
  for (const layer of stack) {
    if (layer?.route?.stack) {
      for (const routeLayer of layer.route.stack) {
        if (typeof routeLayer?.handle === 'function') {
          routeLayer.handle = wrapAsyncHandler(routeLayer.handle);
        }
      }
    } else if (layer?.name === 'router' && layer?.handle?.stack) {
      patchRouterStackAsync(layer.handle.stack);
    } else if (typeof layer?.handle === 'function') {
      layer.handle = wrapAsyncHandler(layer.handle);
    }
  }
}

export async function createApiApp(): Promise<express.Express> {
  void ensureStartupSync();
  const app = express();
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use('/api', (req, res, next) => {
    if (req.path !== '/public/config' && !req.path.startsWith('/media/')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  // Turso Binary Media Streaming (PDFs, Videos, Documents & Large Files with HTTP Range 206 support)
  const INLINE_SAFE_MIME_PREFIXES = ['video/', 'image/', 'application/pdf'];
  const serveTursoMedia = async (req: express.Request, res: express.Response) => {
    try {
      const fileId = String(req.params.id || '').trim();
      if (!fileId || !/^[a-zA-Z0-9_-]{8,64}$/.test(fileId)) {
        return res.status(400).json({ error: 'Invalid media ID' });
      }
      const meta = await getTursoMediaMeta(fileId);
      if (!meta) {
        return res.status(404).json({ error: 'Media file not found' });
      }

      if (!meta.is_public) {
        const hasValidSignedToken = verifyTursoMediaToken(fileId, req.query.exp, req.query.sig);
        if (!hasValidSignedToken) {
          const authHeader = req.headers.authorization || '';
          const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
          const cookieToken = (req.cookies?.madrasa_token as string) || '';
          const jwt = bearer || cookieToken;
          if (!jwt || !supabaseAdmin) {
            return res.status(401).json({ error: 'Unauthorized access to private file' });
          }
          const { data: userCheck, error: authErr } = await supabaseAdmin.auth.getUser(jwt);
          if (authErr || !userCheck?.user) {
            return res.status(401).json({ error: 'Unauthorized access to private file' });
          }
        }
      }

      const totalSize = meta.size_bytes;
      const safeMime = meta.mimetype || 'application/octet-stream';
      const allowInline = INLINE_SAFE_MIME_PREFIXES.some((p) => safeMime.toLowerCase().startsWith(p));
      const dispositionType = allowInline ? 'inline' : 'attachment';
      const safeFilename = meta.original_name.replace(/["\\\r\n]/g, '_');

      res.setHeader('Content-Type', safeMime);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Disposition', `${dispositionType}; filename="${safeFilename}"`);
      res.setHeader(
        'Cache-Control',
        meta.is_public ? 'public, max-age=31536000, immutable' : 'private, max-age=3600'
      );

      if (totalSize === 0) {
        res.setHeader('Content-Length', '0');
        return res.status(200).end();
      }

      const rangeHeader = req.headers.range;
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (!match) {
          res.setHeader('Content-Range', `bytes */${totalSize}`);
          return res.status(416).end();
        }
        const start = match[1] ? parseInt(match[1], 10) : 0;
        // Cap single video Range response to 2 MB so streaming starts immediately on mobile/Vercel
        const defaultEnd = Math.min(totalSize - 1, start + 2 * 1024 * 1024 - 1);
        const requestedEnd = match[2] ? parseInt(match[2], 10) : defaultEnd;
        const end = Math.min(totalSize - 1, requestedEnd);

        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= totalSize) {
          res.setHeader('Content-Range', `bytes */${totalSize}`);
          return res.status(416).end();
        }

        const chunkBuffer = await readTursoMediaByteRange(meta, start, end);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${start + chunkBuffer.length - 1}/${totalSize}`);
        res.setHeader('Content-Length', String(chunkBuffer.length));
        return res.send(chunkBuffer);
      }

      const fullBuffer = await readTursoMediaByteRange(meta, 0, totalSize - 1);
      res.setHeader('Content-Length', String(fullBuffer.length));
      return res.status(200).send(fullBuffer);
    } catch (err: any) {
      console.error('[Turso Media Stream Error]', err);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Failed to stream media file' });
      }
    }
  };

  app.get('/api/media/:id', serveTursoMedia);
  app.get('/api/media/:id/:filename', serveTursoMedia);

  // API Routes (backed by Supabase PostgreSQL, Auth, ImgBB & Turso Media DB)
  app.use('/api/public', publicRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api', coreRoutes);
  app.use('/api', academicRoutes);
  app.use('/api', communityRoutes);
  app.use('/api', reportRoutes);
  app.use('/api', scheduleRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      institution: 'Madrasa Gausiya Razvia',
      supabaseConfigured: isSupabaseServerConfigured,
      imgbbConfigured: isImgbbConfigured(),
      tursoConfigured: isTursoConfigured(),
    });
  });

  // Ensure every Express 4 async route forwards rejected promises to JSON error middleware
  if (app._router?.stack) {
    patchRouterStackAsync(app._router.stack);
  }

  app.use('/api', (_req, res) => {
    if (!res.headersSent) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
  });

  app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'Uploaded file is too large. Maximum allowed size is 10 MB for videos, PDFs & documents.',
        code: 'FILE_TOO_LARGE',
      });
    }
    const isMulterOrValidation =
      err?.name === 'MulterError' ||
      (typeof err?.message === 'string' &&
        (err.message.includes('Only image') || err.message.includes('Unsupported file type')));
    const status = typeof err?.status === 'number' ? err.status : isMulterOrValidation ? 400 : 500;
    console.error('[API Error]', err);
    return res.status(status).json({ error: err?.message || 'Internal server error' });
  });

  return app;
}
