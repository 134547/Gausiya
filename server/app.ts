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

async function ensurePublicRoleExists() {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin
      .from('roles')
      .upsert(
        {
          name: 'Public',
          slug: 'public',
          description: 'Public account access to feed, notices, programs, committee, and contact information',
        },
        { onConflict: 'slug' }
      );
    if (error) {
      console.warn('Public role sync skipped:', error.message);
    }
  } catch {
    // ignore startup sync error
  }
}

let startupSyncPromise: Promise<void> | null = null;

function ensureStartupSync() {
  if (!startupSyncPromise) {
    startupSyncPromise = Promise.all([syncDefaultAddressIfLegacy(), ensurePublicRoleExists()]).then(() => {});
  }
  return startupSyncPromise;
}

export async function createApiApp(): Promise<express.Express> {
  await ensureStartupSync();
  const app = express();
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

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
      institution: 'Madrasa Ghausia Razvia',
      supabaseConfigured: isSupabaseServerConfigured,
      imgbbConfigured: isImgbbConfigured(),
    });
  });

  app.use('/api', (_req, res) => {
    return res.status(404).json({ error: 'API endpoint not found' });
  });

  app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const isMulterOrValidation =
      err?.name === 'MulterError' ||
      (typeof err?.message === 'string' &&
        (err.message.includes('Only image') || err.message.includes('Unsupported file type')));
    const status = typeof err?.status === 'number' ? err.status : isMulterOrValidation ? 400 : 500;
    return res.status(status).json({ error: err?.message || 'Internal server error' });
  });

  return app;
}
