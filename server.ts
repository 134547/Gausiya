import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createApiApp } from './server/app.ts';
import { isSupabaseServerConfigured } from './server/supabase.ts';

async function startServer() {
  const app = await createApiApp();
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
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
    app.use('/api', (_req, res) => {
      if (!res.headersSent) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
    });
    app.use((req, res, next) => {
      if (req.originalUrl === '/api' || req.originalUrl.startsWith('/api/') || req.originalUrl.startsWith('/api?')) {
        if (!res.headersSent) {
          return res.status(404).json({ error: 'API endpoint not found' });
        }
        return;
      }
      return vite.middlewares(req, res, next);
    });
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path === '/api' || req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    if (req.originalUrl === '/api' || req.originalUrl.startsWith('/api/') || req.originalUrl.startsWith('/api?')) {
      return res.status(typeof err?.status === 'number' ? err.status : 500).json({
        error: err?.message || 'Internal server error',
      });
    }
    res.status(500).send('Internal server error');
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Madrasa Gausiya Razvia Portal running on http://0.0.0.0:${PORT} (Supabase: ${isSupabaseServerConfigured ? 'configured' : 'awaiting credentials'})`
    );
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
