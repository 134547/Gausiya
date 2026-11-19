import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { isSupabaseServerConfigured, supabaseAdmin } from './supabase.ts';
import { isImgbbConfigured } from './imgbb.ts';
import authRoutes from './routes/authRoutes.ts';
import dashboardRoutes from './routes/dashboardRoutes.ts';
import coreRoutes from './routes/coreRoutes.ts';
import academicRoutes from './routes/academicRoutes.ts';
import communityRoutes from './routes/communityRoutes.ts';
import publicRoutes from './routes/publicRoutes.ts';

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
    startupSyncPromise = Promise.all([syncDefaultAddressIfLegacy(), ensureCoreRolesExist()]).then(() => {});
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
    if (req.path !== '/public/config') {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  // API Routes (backed by Supabase PostgreSQL, Auth & ImgBB)
  app.use('/api/public', publicRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api', coreRoutes);
  app.use('/api', academicRoutes);
  app.use('/api', communityRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      institution: 'Madrasa Gausiya Razvia',
      supabaseConfigured: isSupabaseServerConfigured,
      imgbbConfigured: isImgbbConfigured(),
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
        error: 'Uploaded file is too large (max 4 MB). Please upload a smaller image.',
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
