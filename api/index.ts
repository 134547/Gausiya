import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiApp } from '../server/app.ts';

let appPromise: ReturnType<typeof createApiApp> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (!appPromise) {
      appPromise = createApiApp().catch((err) => {
        appPromise = null;
        throw err;
      });
    }
    const app = await appPromise;
    return app(req as any, res as any);
  } catch (err: any) {
    console.error('[Vercel API Error]', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: err?.message || 'Internal API error' }));
    }
  }
}
