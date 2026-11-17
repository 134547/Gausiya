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
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Madrasa Gausiya Razvia Portal running on http://0.0.0.0:${PORT} (Supabase: ${isSupabaseServerConfigured ? 'configured' : 'awaiting credentials'})`
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
