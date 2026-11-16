import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { isSupabaseServerConfigured, supabaseAdmin } from './server/supabase.ts';
import { isImgbbConfigured } from './server/imgbb.ts';
import authRoutes from './server/routes/authRoutes.ts';
import dashboardRoutes from './server/routes/dashboardRoutes.ts';
import coreRoutes from './server/routes/coreRoutes.ts';
import academicRoutes from './server/routes/academicRoutes.ts';
import communityRoutes from './server/routes/communityRoutes.ts';
import publicRoutes from './server/routes/publicRoutes.ts';

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
    await supabaseAdmin
      .from('roles')
      .upsert(
        {
          name: 'Public',
          slug: 'public',
          description: 'Public account access to feed, notices, programs, committee, and contact information',
        },
        { onConflict: 'slug' }
      );
  } catch {
    // ignore startup sync error
  }
}

async function startServer() {
  await Promise.all([syncDefaultAddressIfLegacy(), ensurePublicRoleExists()]);
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // API Routes (backed by Supabase PostgreSQL, Auth & Storage)
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
      typeof err?.message === 'string' &&
        (err.message.includes('Only image') || err.message.includes('Unsupported file type'));
    const status = typeof err?.status === 'number' ? err.status : isMulterOrValidation ? 400 : 500;
    return res.status(status).json({ error: err?.message || 'Internal server error' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (!result) return next();
        const patched = result.code.replace(
          /transport\.connect\(createHMRHandler\(handleMessage\)\);?/g,
          '/* HMR WebSocket disabled */'
        );
        res.setHeader('Cache-Control', 'no-cache');
        res.type('application/javascript').send(patched);
      } catch (err) {
        next(err);
      }
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Madrasa Ghausia Razvia Portal running on http://0.0.0.0:${PORT} (Supabase: ${isSupabaseServerConfigured ? 'configured' : 'awaiting credentials'})`
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
